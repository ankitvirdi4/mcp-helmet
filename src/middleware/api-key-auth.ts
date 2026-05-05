// apiKeyAuth() — verifies a custom header carrying an API key.
//
// Default header is `X-API-Key`. The user supplies a `validate` function
// that returns either a falsy value (rejection) or an AuthContext shape
// (acceptance). On acceptance the middleware writes `ctx.auth` so the
// rest of the request lifecycle (and tool handlers via `getAuthContext`)
// can read it.
//
// On rejection the middleware short circuits with 401 and a small JSON
// body. The `optional` flag lets requests with no header pass through.

import type { AuthContext } from "../auth-context.js";
import type { Middleware } from "../middleware.js";

export interface ApiKeyAuthOptions {
  // Header name to read. Default "X-API-Key". Comparison is case
  // insensitive (Node lowercases headers).
  header?: string;
  // Key validator. Return an AuthContext object on success, or null /
  // undefined / false on failure. Throwing is treated as a failure.
  validate: (
    key: string,
  ) => Promise<AuthContext | null | undefined | false> | AuthContext | null | undefined | false;
  // When true, requests with no key header pass through with ctx.auth
  // unset. Requests that present a key are still validated. Default false.
  optional?: boolean;
}

export function apiKeyAuth(opts: ApiKeyAuthOptions): Middleware {
  const headerName = (opts.header ?? "X-API-Key").toLowerCase();

  return {
    name: "apiKeyAuth",
    async before(ctx) {
      const raw = ctx.req.headers[headerName];
      const key = Array.isArray(raw) ? raw[0] : raw;

      if (!key) {
        if (opts.optional) return;
        return reject(ctx, "missing_key", "Missing API key");
      }

      const trimmed = key.trim();
      if (!trimmed) {
        return reject(ctx, "invalid_request", "Empty API key");
      }

      let result: AuthContext | null | undefined | false;
      try {
        result = await opts.validate(trimmed);
      } catch (err) {
        process.stderr.write(
          `mcp-helmet apiKeyAuth: validate threw: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return reject(ctx, "invalid_key", "Key validation failed");
      }

      if (!result) {
        return reject(ctx, "invalid_key", "Invalid API key");
      }

      ctx.auth = result;
    },
  };
}

function reject(
  ctx: { res: import("node:http").ServerResponse },
  errorCode: string,
  description: string,
): { handled: true } {
  ctx.res.statusCode = 401;
  ctx.res.setHeader("content-type", "application/json");
  ctx.res.end(JSON.stringify({ error: errorCode, error_description: description }));
  return { handled: true };
}
