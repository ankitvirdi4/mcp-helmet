import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { runWithAuthContext } from "../auth-context.js";
import type { HttpRequestContext } from "../middleware.js";
import { requestLog, type RequestLogEntry } from "./request-log.js";

class FakeRes extends EventEmitter {
  statusCode = 200;
  writableEnded = false;
  end(_body?: unknown): this {
    this.writableEnded = true;
    return this;
  }
}

function makeCtx(
  url = "/mcp",
  method = "POST",
): { ctx: HttpRequestContext; res: FakeRes } {
  const res = new FakeRes();
  const req = { url, method, headers: {} } as unknown as HttpRequestContext["req"];
  return { ctx: { req, res } as unknown as HttpRequestContext, res };
}

describe("requestLog middleware", () => {
  it("emits a JSON entry when res.end is called", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({ logger: (e) => entries.push(e) });
    const { ctx, res } = makeCtx("/mcp", "POST");

    await mw.before!(ctx);
    res.statusCode = 200;
    res.end();

    expect(entries).toHaveLength(1);
    expect(entries[0].method).toBe("POST");
    expect(entries[0].url).toBe("/mcp");
    expect(entries[0].status).toBe(200);
    expect(typeof entries[0].duration_ms).toBe("number");
    expect(entries[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(entries[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("captures auth principal from getAuthContext", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({ logger: (e) => entries.push(e) });
    const { ctx, res } = makeCtx();

    await runWithAuthContext({ user: "alice", scopes: ["read", "write"] }, async () => {
      await mw.before!(ctx);
      res.end();
    });

    expect(entries[0].user).toBe("alice");
    expect(entries[0].scopes).toEqual(["read", "write"]);
  });

  it("omits user/scopes fields when no auth context is set", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({ logger: (e) => entries.push(e) });
    const { ctx, res } = makeCtx();

    await mw.before!(ctx);
    res.end();

    expect(entries[0].user).toBeUndefined();
    expect(entries[0].scopes).toBeUndefined();
  });

  it("captures non-200 status codes", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({ logger: (e) => entries.push(e) });
    const { ctx, res } = makeCtx();

    await mw.before!(ctx);
    res.statusCode = 401;
    res.end();

    expect(entries[0].status).toBe(401);
  });

  it("skips GET /healthz by default", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({ logger: (e) => entries.push(e) });
    const { ctx, res } = makeCtx("/healthz", "GET");

    await mw.before!(ctx);
    res.end();

    expect(entries).toHaveLength(0);
  });

  it("respects a custom skip function", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({
      logger: (e) => entries.push(e),
      skip: (req) => req.url === "/internal",
    });
    const { ctx: skipped, res: skippedRes } = makeCtx("/internal", "GET");
    const { ctx: kept, res: keptRes } = makeCtx("/mcp", "POST");

    await mw.before!(skipped);
    skippedRes.end();
    await mw.before!(kept);
    keptRes.end();

    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("/mcp");
  });

  it("merges extra fields from the extra() callback", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({
      logger: (e) => entries.push(e),
      extra: (req) => ({
        request_id: (req.headers["x-request-id"] as string) ?? "missing",
      }),
    });
    const { ctx, res } = makeCtx();
    (ctx.req as { headers: Record<string, unknown> }).headers["x-request-id"] = "abc-123";

    await mw.before!(ctx);
    res.end();

    expect(entries[0].request_id).toBe("abc-123");
  });

  it("emits exactly once even if res.end is called multiple times", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({ logger: (e) => entries.push(e) });
    const { ctx, res } = makeCtx();

    await mw.before!(ctx);
    res.end();
    res.end();

    expect(entries).toHaveLength(1);
  });

  it("emits when the connection closes before res.end fires", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({ logger: (e) => entries.push(e) });
    const { ctx, res } = makeCtx();

    await mw.before!(ctx);
    // Client hangs up; res.end never called.
    res.emit("close");

    expect(entries).toHaveLength(1);
  });

  it("does not emit again on close once res.end already fired", async () => {
    const entries: RequestLogEntry[] = [];
    const mw = requestLog({ logger: (e) => entries.push(e) });
    const { ctx, res } = makeCtx();

    await mw.before!(ctx);
    res.end();
    res.emit("close");

    expect(entries).toHaveLength(1);
  });

  it("a logger that throws does not break the response", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const mw = requestLog({
      logger: () => {
        throw new Error("logger broken");
      },
    });
    const { ctx, res } = makeCtx();

    await mw.before!(ctx);
    expect(() => res.end()).not.toThrow();
    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });

  it("default logger writes one JSON line per request to stderr", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const mw = requestLog();
    const { ctx, res } = makeCtx();

    await mw.before!(ctx);
    res.end();

    expect(stderr).toHaveBeenCalledTimes(1);
    const payload = (stderr.mock.calls[0]?.[0] as string).trim();
    const parsed = JSON.parse(payload);
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("/mcp");

    stderr.mockRestore();
  });
});
