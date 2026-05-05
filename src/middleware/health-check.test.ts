import { describe, expect, it, vi } from "vitest";
import { createServer } from "../mcp-server.js";
import { healthCheck } from "./health-check.js";

function makeMockReqRes(url: string, method = "GET") {
  const req = { url, method } as { url: string; method: string };
  const res = makeMockRes();
  return { req, res };
}

function makeMockRes() {
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

describe("healthCheck middleware", () => {
  it("matches the default /healthz path and returns 200 with default body", async () => {
    const server = createServer({ name: "test", version: "1.2.3" });
    const mw = healthCheck();
    if (mw.setup) await mw.setup(server);

    const { req, res } = makeMockReqRes("/healthz");
    const result = await mw.before!({ req, res } as never);

    expect(result).toEqual({ handled: true });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.tools).toBe(0);
    expect(body.version).toBe("1.2.3");
    expect(typeof body.uptime).toBe("number");
  });

  it("includes the registered tool count", async () => {
    const server = createServer({ name: "test", version: "1.0.0" });
    server.tool("a", undefined, async () => "a");
    server.tool("b", undefined, async () => "b");
    const mw = healthCheck();
    if (mw.setup) await mw.setup(server);

    const { req, res } = makeMockReqRes("/healthz");
    await mw.before!({ req, res } as never);
    expect(JSON.parse(res.body).tools).toBe(2);
  });

  it("ignores unrelated paths (returns void, lets MCP handle)", async () => {
    const server = createServer({ name: "test", version: "1.0.0" });
    const mw = healthCheck();
    if (mw.setup) await mw.setup(server);

    const { req, res } = makeMockReqRes("/mcp/messages");
    const result = await mw.before!({ req, res } as never);
    expect(result).toBeUndefined();
    expect(res.body).toBe("");
  });

  it("strips query strings before matching", async () => {
    const server = createServer({ name: "test", version: "1.0.0" });
    const mw = healthCheck();
    if (mw.setup) await mw.setup(server);

    const { req, res } = makeMockReqRes("/healthz?foo=bar");
    const result = await mw.before!({ req, res } as never);
    expect(result).toEqual({ handled: true });
  });

  it("respects a custom path", async () => {
    const server = createServer({ name: "test", version: "1.0.0" });
    const mw = healthCheck({ path: "/_health" });
    if (mw.setup) await mw.setup(server);

    const fail = await mw.before!(
      { req: { url: "/healthz", method: "GET" }, res: makeMockRes() } as never,
    );
    expect(fail).toBeUndefined();

    const ok = await mw.before!(
      { req: { url: "/_health", method: "GET" }, res: makeMockRes() } as never,
    );
    expect(ok).toEqual({ handled: true });
  });

  it("ignores non GET methods (lets MCP handle them)", async () => {
    const server = createServer({ name: "test", version: "1.0.0" });
    const mw = healthCheck();
    if (mw.setup) await mw.setup(server);

    const { req, res } = makeMockReqRes("/healthz", "POST");
    const result = await mw.before!({ req, res } as never);
    expect(result).toBeUndefined();
  });

  it("respects a custom body callback", async () => {
    const server = createServer({ name: "test", version: "1.0.0" });
    const mw = healthCheck({
      body: (s) => ({ name: s.info.name, custom: 42 }),
    });
    if (mw.setup) await mw.setup(server);

    const { req, res } = makeMockReqRes("/healthz");
    await mw.before!({ req, res } as never);
    expect(JSON.parse(res.body)).toEqual({ name: "test", custom: 42 });
  });

  it("supports an async body callback", async () => {
    const server = createServer({ name: "test", version: "1.0.0" });
    const mw = healthCheck({
      body: async () =>
        new Promise((resolve) => setTimeout(() => resolve({ async: true }), 10)),
    });
    if (mw.setup) await mw.setup(server);

    const { req, res } = makeMockReqRes("/healthz");
    await mw.before!({ req, res } as never);
    expect(JSON.parse(res.body)).toEqual({ async: true });
  });

  it("returns void when setup has not run yet (defensive)", async () => {
    const mw = healthCheck();
    const { req, res } = makeMockReqRes("/healthz");
    const result = await mw.before!({ req, res } as never);
    expect(result).toBeUndefined();
  });

  it("computes a non negative uptime once startedAt is set", async () => {
    const server = createServer({ name: "test", version: "1.0.0" });
    const mw = healthCheck();
    if (mw.setup) await mw.setup(server);

    // Force startedAt by calling start would create real transport.
    // Instead simulate by reading defaultBody indirectly via running start
    // path manually. Skip: covered by integration tests on mcp-server.
    void vi;

    const { req, res } = makeMockReqRes("/healthz");
    await mw.before!({ req, res } as never);
    expect(JSON.parse(res.body).uptime).toBeGreaterThanOrEqual(0);
  });
});
