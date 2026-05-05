// rateLimiter() — sliding-window rate limiting per client.
//
// Tracks request counts in a sliding window keyed by client identifier.
// Default key is the remote IP address; users can supply a custom `keyFn`
// to key by API key, user ID, or anything else from the request.
//
// When the limit is exceeded, the middleware short circuits with 429 and
// standard rate-limit headers. Requests below the limit pass through with
// informational headers attached.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Middleware } from "../middleware.js";

export interface RateLimiterOptions {
  // Maximum number of requests allowed per window. Default 100.
  max?: number;
  // Window size in milliseconds. Default 60_000 (1 minute).
  windowMs?: number;
  // Extract a key from the request. Requests with the same key share a
  // rate limit bucket. Default: remote IP address.
  keyFn?: (req: IncomingMessage) => string;
  // When true, rate-limit headers (X-RateLimit-*) are added to allowed
  // responses. Default true.
  headers?: boolean;
  // Custom message in the 429 JSON body. Default "Too many requests".
  message?: string;
}

interface WindowEntry {
  timestamps: number[];
}

export function rateLimiter(opts: RateLimiterOptions = {}): Middleware {
  const max = opts.max ?? 100;
  const windowMs = opts.windowMs ?? 60_000;
  const keyFn = opts.keyFn ?? defaultKeyFn;
  const includeHeaders = opts.headers !== false;
  const message = opts.message ?? "Too many requests";

  // In-memory store. Keyed by client identifier.
  const store = new Map<string, WindowEntry>();

  // Periodic cleanup to prevent unbounded memory growth.
  // Runs every windowMs, removes entries with no recent timestamps.
  let cleanupTimer: ReturnType<typeof setInterval> | undefined;

  return {
    name: "rateLimiter",

    setup() {
      cleanupTimer = setInterval(() => {
        const cutoff = Date.now() - windowMs;
        for (const [key, entry] of store) {
          entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
          if (entry.timestamps.length === 0) {
            store.delete(key);
          }
        }
      }, windowMs);
      // Don't block process exit.
      if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
        cleanupTimer.unref();
      }

      return () => {
        if (cleanupTimer !== undefined) {
          clearInterval(cleanupTimer);
          cleanupTimer = undefined;
        }
        store.clear();
      };
    },

    before(ctx) {
      const now = Date.now();
      const cutoff = now - windowMs;
      const key = keyFn(ctx.req);

      let entry = store.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Slide the window: drop timestamps older than cutoff.
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

      const count = entry.timestamps.length;
      const resetAt = count > 0 ? entry.timestamps[0] + windowMs : now + windowMs;

      if (count >= max) {
        return reject(ctx.res, max, resetAt, message, includeHeaders);
      }

      // Record this request.
      entry.timestamps.push(now);

      // Attach informational headers to the response.
      if (includeHeaders) {
        ctx.res.setHeader("x-ratelimit-limit", String(max));
        ctx.res.setHeader("x-ratelimit-remaining", String(max - entry.timestamps.length));
        ctx.res.setHeader("x-ratelimit-reset", String(Math.ceil(resetAt / 1000)));
      }
    },
  };
}

function defaultKeyFn(req: IncomingMessage): string {
  // req.socket.remoteAddress is the most reliable source. Fall back to
  // x-forwarded-for for reverse-proxied setups, then a constant.
  const forwarded = req.headers["x-forwarded-for"];
  const xff = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return req.socket?.remoteAddress ?? xff?.split(",")[0]?.trim() ?? "unknown";
}

function reject(
  res: ServerResponse,
  max: number,
  resetAt: number,
  message: string,
  includeHeaders: boolean,
): { handled: true } {
  const retryAfterSecs = Math.ceil((resetAt - Date.now()) / 1000);

  res.statusCode = 429;
  res.setHeader("content-type", "application/json");
  res.setHeader("retry-after", String(Math.max(retryAfterSecs, 1)));

  if (includeHeaders) {
    res.setHeader("x-ratelimit-limit", String(max));
    res.setHeader("x-ratelimit-remaining", "0");
    res.setHeader("x-ratelimit-reset", String(Math.ceil(resetAt / 1000)));
  }

  res.end(JSON.stringify({ error: "rate_limited", error_description: message }));
  return { handled: true };
}
