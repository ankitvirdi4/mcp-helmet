import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimiter } from "./rate-limiter.js";
import type { HttpRequestContext } from "../middleware.js";

function makeCtx(
  ip = "127.0.0.1",
  headers: Record<string, string | string[] | undefined> = {},
): { ctx: HttpRequestContext; res: ReturnType<typeof makeRes> } {
  const res = makeRes();
  const req = {
    headers,
    url: "/mcp",
    method: "POST",
    socket: { remoteAddress: ip },
  } as unknown as HttpRequestContext["req"];
  return { ctx: { req, res } as unknown as HttpRequestContext, res };
}

function makeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = "";
  return {
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    end(b?: string) {
      if (b !== undefined) body = b;
    },
    get headers() {
      return headers;
    },
    get body() {
      return body;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
    get statusCode() {
      return statusCode;
    },
  };
}

describe("rateLimiter middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const mw = rateLimiter({ max: 3, windowMs: 60_000 });
    const { ctx, res } = makeCtx();
    const result = mw.before!(ctx);
    expect(result).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-ratelimit-limit"]).toBe("3");
    expect(res.headers["x-ratelimit-remaining"]).toBe("2");
  });

  it("rejects requests over the limit with 429", () => {
    const mw = rateLimiter({ max: 2, windowMs: 60_000 });

    // Use up the limit.
    mw.before!(makeCtx().ctx);
    mw.before!(makeCtx().ctx);

    // Third request should be rejected.
    const { ctx, res } = makeCtx();
    const result = mw.before!(ctx);
    expect(result).toEqual({ handled: true });
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("rate_limited");
    expect(body.error_description).toBe("Too many requests");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("resets the window after windowMs elapses", () => {
    const mw = rateLimiter({ max: 1, windowMs: 1_000 });

    // First request: allowed.
    mw.before!(makeCtx().ctx);

    // Second request: blocked.
    const { res: res1 } = makeCtx();
    mw.before!(makeCtx().ctx);

    // Advance past the window.
    vi.advanceTimersByTime(1_001);

    // Now allowed again.
    const { ctx, res } = makeCtx();
    const result = mw.before!(ctx);
    expect(result).toBeUndefined();
    expect(res.statusCode).toBe(200);
  });

  it("tracks different clients independently", () => {
    const mw = rateLimiter({ max: 1, windowMs: 60_000 });

    // Client A uses the limit.
    mw.before!(makeCtx("10.0.0.1").ctx);

    // Client A blocked.
    const { ctx: ctxA, res: resA } = makeCtx("10.0.0.1");
    const resultA = mw.before!(ctxA);
    expect(resultA).toEqual({ handled: true });
    expect(resA.statusCode).toBe(429);

    // Client B still allowed.
    const { ctx: ctxB, res: resB } = makeCtx("10.0.0.2");
    const resultB = mw.before!(ctxB);
    expect(resultB).toBeUndefined();
    expect(resB.statusCode).toBe(200);
  });

  it("supports a custom keyFn", () => {
    const mw = rateLimiter({
      max: 1,
      windowMs: 60_000,
      keyFn: (req) => (req.headers["x-api-key"] as string) ?? "anon",
    });

    // Key "a" uses the limit.
    mw.before!(makeCtx("1.1.1.1", { "x-api-key": "a" }).ctx);

    // Key "a" from a different IP still blocked (same key).
    const { ctx, res } = makeCtx("2.2.2.2", { "x-api-key": "a" });
    const result = mw.before!(ctx);
    expect(result).toEqual({ handled: true });
    expect(res.statusCode).toBe(429);

    // Key "b" allowed.
    const { ctx: ctx2, res: res2 } = makeCtx("1.1.1.1", { "x-api-key": "b" });
    const result2 = mw.before!(ctx2);
    expect(result2).toBeUndefined();
    expect(res2.statusCode).toBe(200);
  });

  it("omits rate-limit headers when headers option is false", () => {
    const mw = rateLimiter({ max: 5, windowMs: 60_000, headers: false });
    const { ctx, res } = makeCtx();
    mw.before!(ctx);
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeUndefined();
    expect(res.headers["x-ratelimit-reset"]).toBeUndefined();
  });

  it("includes retry-after header on 429 even when headers option is false", () => {
    const mw = rateLimiter({ max: 1, windowMs: 60_000, headers: false });
    mw.before!(makeCtx().ctx);

    const { ctx, res } = makeCtx();
    mw.before!(ctx);
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    // But no x-ratelimit-* headers.
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });

  it("uses custom message in 429 body", () => {
    const mw = rateLimiter({ max: 1, windowMs: 60_000, message: "Slow down!" });
    mw.before!(makeCtx().ctx);
    const { ctx, res } = makeCtx();
    mw.before!(ctx);
    expect(JSON.parse(res.body).error_description).toBe("Slow down!");
  });

  it("falls back to x-forwarded-for when remoteAddress is undefined", () => {
    const mw = rateLimiter({ max: 1, windowMs: 60_000 });
    const res = makeRes();
    const req = {
      headers: { "x-forwarded-for": "99.99.99.99, 10.0.0.1" },
      url: "/mcp",
      method: "POST",
      socket: {},
    } as unknown as HttpRequestContext["req"];
    const ctx = { req, res } as unknown as HttpRequestContext;

    mw.before!(ctx);

    // Same XFF → blocked.
    const res2 = makeRes();
    const req2 = {
      headers: { "x-forwarded-for": "99.99.99.99" },
      url: "/mcp",
      method: "POST",
      socket: {},
    } as unknown as HttpRequestContext["req"];
    const ctx2 = { req: req2, res: res2 } as unknown as HttpRequestContext;
    const result = mw.before!(ctx2);
    expect(result).toEqual({ handled: true });
    expect(res2.statusCode).toBe(429);
  });

  it("cleanup callback clears interval and store", () => {
    const mw = rateLimiter({ max: 10, windowMs: 60_000 });

    // Setup returns a cleanup function.
    const fakeServer = {} as any;
    const cleanup = mw.setup!(fakeServer);
    expect(typeof cleanup).toBe("function");

    // Make some requests to populate the store.
    mw.before!(makeCtx().ctx);

    // Cleanup should not throw.
    cleanup!();
  });

  it("uses default options when none provided", () => {
    const mw = rateLimiter();
    expect(mw.name).toBe("rateLimiter");

    // Should allow at least one request with defaults (max=100).
    const { ctx, res } = makeCtx();
    const result = mw.before!(ctx);
    expect(result).toBeUndefined();
    expect(res.headers["x-ratelimit-limit"]).toBe("100");
    expect(res.headers["x-ratelimit-remaining"]).toBe("99");
  });

  it("decrements remaining count correctly across requests", () => {
    const mw = rateLimiter({ max: 3, windowMs: 60_000 });

    const { res: res1 } = makeCtx();
    mw.before!(makeCtx().ctx);
    // After 1 request: 2 remaining.

    const { ctx: ctx2, res: res2 } = makeCtx();
    mw.before!(ctx2);
    expect(res2.headers["x-ratelimit-remaining"]).toBe("1");

    const { ctx: ctx3, res: res3 } = makeCtx();
    mw.before!(ctx3);
    expect(res3.headers["x-ratelimit-remaining"]).toBe("0");

    // 4th request: blocked.
    const { ctx: ctx4, res: res4 } = makeCtx();
    const result = mw.before!(ctx4);
    expect(result).toEqual({ handled: true });
    expect(res4.statusCode).toBe(429);
  });
});
