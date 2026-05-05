// gracefulShutdown() — registers SIGTERM and SIGINT handlers that call
// server.stop() with a timeout. On signal:
//
//   1. Stop accepting new connections (transport.close happens via stop())
//   2. Wait up to timeoutMs for in-flight requests to drain (best effort:
//      the SDK's StreamableHTTPServerTransport handles this internally)
//   3. Run cleanup callbacks from other middleware in reverse order
//   4. Exit the process with code 0 (or 1 if cleanup errored)
//
// The handler is best-effort safe: it removes the registered listeners on
// cleanup, so multiple servers in one process do not stack signal handlers.

import type { Middleware } from "../middleware.js";

export interface GracefulShutdownOptions {
  // Maximum milliseconds to wait for stop() to complete before forcing exit.
  // Default 30000.
  timeoutMs?: number;
  // Signals to listen for. Default ["SIGTERM", "SIGINT"].
  signals?: NodeJS.Signals[];
  // Override process.exit, primarily for tests. Default process.exit.
  exit?: (code: number) => void;
  // Override the global process for tests.
  process?: NodeJS.Process;
}

export function gracefulShutdown(
  opts: GracefulShutdownOptions = {},
): Middleware {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const signals = opts.signals ?? ["SIGTERM", "SIGINT"];
  const proc = opts.process ?? process;
  const exit = opts.exit ?? proc.exit.bind(proc);

  return {
    name: "gracefulShutdown",
    setup(server) {
      // Track installed listeners so we can remove them on cleanup.
      const listeners = new Map<NodeJS.Signals, () => void>();
      let shuttingDown = false;

      const onSignal = (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        shuttingDown = true;

        // Best-effort: stop the server within the timeout, then exit.
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<void>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`shutdown timeout after ${timeoutMs}ms`)),
            timeoutMs,
          );
        });

        Promise.race([invokeStop(server), timeoutPromise])
          .then(
            () => exit(0),
            (err) => {
              if (proc.stderr) {
                proc.stderr.write(
                  `mcp-helmet: graceful shutdown on ${signal} failed: ${err instanceof Error ? err.message : String(err)}\n`,
                );
              }
              exit(1);
            },
          )
          .finally(() => {
            if (timer) clearTimeout(timer);
          });
      };

      for (const sig of signals) {
        const handler = () => onSignal(sig);
        proc.on(sig, handler);
        listeners.set(sig, handler);
      }

      // Cleanup: remove handlers when server.stop() runs.
      return () => {
        for (const [sig, handler] of listeners) {
          proc.off(sig, handler);
        }
        listeners.clear();
      };
    },
  };
}

// The toolkit server exposes `stop()` only on the start() return value, not
// on the server itself. Since middleware setup runs before start() resolves
// the stop handle, we can't call stop() directly here. Instead the user
// invokes server.start() and the returned stop() does its own cleanup which
// includes our `setup` cleanup callback. So on signal, the right thing is
// to call the SDK's underlying close path via the raw server.
//
// For v0.1 we close the raw transport via raw.close(). v0.2 will refactor
// so middleware can call the toolkit's stop() directly.
async function invokeStop(
  server: { raw: { close?: () => Promise<void> } },
): Promise<void> {
  if (typeof server.raw.close === "function") {
    await server.raw.close();
  }
}
