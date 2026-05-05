import { describe, expect, it, vi } from "vitest";
import { apiKeyAuth } from "./api-key-auth.js";
import type { HttpRequestContext } from "../middleware.js";

function makeCtx(headers: Record<string, string | string[] | undefined> = {}): {
  ctx: HttpRequestContext;
  res: ReturnType<typeof makeRes>;
} {
  const res = makeRes();
  const req = { headers, url: "/mcp", method: "POST" } as unknown as HttpRequestContext["req"];
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

describe("apiKeyAuth middleware", () => {
  it("returns 401 missing_key when default header is absent", async () => {
    const mw = apiKeyAuth({ validate: () => ({ user: "x" }) });
    const { ctx, res } = makeCtx();
    const result = await mw.before!(ctx);
    expect(result).toEqual({ handled: true });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("missing_key");
  });

  it("passes through when optional and no key present", async () => {
    const mw = apiKeyAuth({ validate: () => ({ user: "x" }), optional: true });
    const { ctx, res } = makeCtx();
    const result = await mw.before!(ctx);
    expect(result).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(ctx.auth).toBeUndefined();
  });

  it("returns 401 invalid_request on whitespace-only key", async () => {
    const mw = apiKeyAuth({ validate: () => ({ user: "x" }) });
    const { ctx, res } = makeCtx({ "x-api-key": "    " });
    await mw.before!(ctx);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("invalid_request");
  });

  it("returns 401 invalid_key when validate returns falsy", async () => {
    const mw = apiKeyAuth({ validate: () => false });
    const { ctx, res } = makeCtx({ "x-api-key": "bad" });
    await mw.before!(ctx);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("invalid_key");
  });

  it("returns 401 invalid_key when validate throws", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const mw = apiKeyAuth({
      validate: () => {
        throw new Error("kaboom");
      },
    });
    const { ctx, res } = makeCtx({ "x-api-key": "x" });
    await mw.before!(ctx);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("invalid_key");
    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });

  it("populates ctx.auth on successful validate", async () => {
    const mw = apiKeyAuth({
      validate: (key) => {
        expect(key).toBe("good");
        return { user: "svc1", scopes: ["write"] };
      },
    });
    const { ctx, res } = makeCtx({ "x-api-key": "good" });
    const result = await mw.before!(ctx);
    expect(result).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(ctx.auth).toEqual({ user: "svc1", scopes: ["write"] });
  });

  it("supports async validate", async () => {
    const mw = apiKeyAuth({
      validate: async (k) => {
        await new Promise((r) => setTimeout(r, 5));
        return { user: k };
      },
    });
    const { ctx } = makeCtx({ "x-api-key": "u" });
    await mw.before!(ctx);
    expect(ctx.auth?.user).toBe("u");
  });

  it("respects a custom header (case insensitive lookup)", async () => {
    const mw = apiKeyAuth({
      header: "X-Service-Token",
      validate: () => ({ user: "svc" }),
    });
    const { ctx } = makeCtx({ "x-service-token": "abc" });
    await mw.before!(ctx);
    expect(ctx.auth?.user).toBe("svc");
  });

  it("ignores Authorization when configured for X-API-Key only", async () => {
    const mw = apiKeyAuth({ validate: () => ({ user: "x" }) });
    const { ctx, res } = makeCtx({ authorization: "Bearer abc" });
    await mw.before!(ctx);
    expect(res.statusCode).toBe(401);
    expect(ctx.auth).toBeUndefined();
  });

  it("reads first value when header is an array", async () => {
    const mw = apiKeyAuth({ validate: () => ({ user: "x" }) });
    const { ctx } = makeCtx({ "x-api-key": ["k1", "k2"] });
    await mw.before!(ctx);
    expect(ctx.auth?.user).toBe("x");
  });
});
