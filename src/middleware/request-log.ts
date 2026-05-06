// requestLog() — structured request log per HTTP request.
//
// Hooks the `before` phase only: captures the start time, records the
// auth principal if any, and wraps `res.end()` so the log line is
// emitted exactly when the response finishes. No `after` hook needed.
//
// Default logger writes one JSON line per request to stderr. stderr
// (not stdout) because in dual-mode setups stdout may be carrying MCP
// protocol traffic to a parent process; stderr is always safe.
//
// Order matters: install requestLog AFTER auth middleware so getAuthContext()
// returns the verified principal at log-emit time. The before hooks run
// in registration order, but our wrapper of res.end fires when the
// response is written, by which point auth middleware has populated the
// store.

import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthContext } from "../auth-context.js";
import type { Middleware } from "../middleware.js";

export interface RequestLogEntry {
  ts: string;
  method: string;
  url: string;
  status: number;
  duration_ms: number;
  user?: string;
  scopes?: readonly string[];
  // Free-form fields injected by `extra`. Useful for request id,
  // tenant id, etc.
  [key: string]: unknown;
}

export interface RequestLogOptions {
  // Where to write log entries. Default writes one JSON line per request
  // to process.stderr.
  logger?: (entry: RequestLogEntry) => void;
  // Skip logging for requests where this returns true. Default skips
  // GET /healthz (the default healthCheck path) so probe traffic does
  // not flood the logs.
  skip?: (req: IncomingMessage) => boolean;
  // Inject extra fields into every log entry. Receives the request and
  // returns key/value pairs that get merged into the entry. Use for
  // request-id propagation, tenant ids, etc.
  extra?: (req: IncomingMessage) => Record<string, unknown>;
}

const HEALTHZ = /^\/healthz(\?|$)/;

function defaultLogger(entry: RequestLogEntry): void {
  process.stderr.write(JSON.stringify(entry) + "\n");
}

function defaultSkip(req: IncomingMessage): boolean {
  return (req.method ?? "").toUpperCase() === "GET" && HEALTHZ.test(req.url ?? "");
}

export function requestLog(opts: RequestLogOptions = {}): Middleware {
  const logger = opts.logger ?? defaultLogger;
  const skip = opts.skip ?? defaultSkip;
  const extraFn = opts.extra;

  return {
    name: "requestLog",
    before(ctx) {
      if (skip(ctx.req)) return;

      const start = Date.now();
      const res = ctx.res;
      const originalEnd = res.end.bind(res) as ServerResponse["end"];

      let emitted = false;
      const emit = (): void => {
        if (emitted) return;
        emitted = true;

        const auth = getAuthContext();
        const entry: RequestLogEntry = {
          ts: new Date(start).toISOString(),
          method: (ctx.req.method ?? "").toUpperCase(),
          url: ctx.req.url ?? "",
          status: res.statusCode,
          duration_ms: Date.now() - start,
          ...(auth?.user !== undefined ? { user: auth.user } : {}),
          ...(auth?.scopes !== undefined ? { scopes: auth.scopes } : {}),
          ...(extraFn ? extraFn(ctx.req) : {}),
        };

        try {
          logger(entry);
        } catch (err) {
          // Logger failure must not break the response. Surface it on
          // stderr but do not propagate.
          process.stderr.write(
            `mcp-helmet requestLog: logger threw: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      };

      // Wrap res.end so we emit at response completion. We keep the
      // signature loose because Node has multiple overloads; the cast
      // is necessary and harmless.
      res.end = function patchedEnd(this: ServerResponse, ...args: unknown[]) {
        emit();
        return (originalEnd as (...a: unknown[]) => ServerResponse).apply(this, args);
      } as ServerResponse["end"];

      // Belt-and-braces: also emit on aborted/closed connections so we
      // do not lose log lines for clients that hang up before res.end.
      const onClose = (): void => {
        if (!res.writableEnded) emit();
      };
      res.once("close", onClose);
    },
  };
}
