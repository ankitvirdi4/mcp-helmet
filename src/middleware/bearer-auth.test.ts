import { describe, expect, it, vi } from "vitest";
import { bearerAuth } from "./bearer-auth.js";
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

describe("bearerAuth middleware", () => {
  it("returns 401 with WWW-Authenticate when no header is present", async () => {
    const mw = bearerAuth({ verify: () => ({ user: "x" }) });
    const { ctx, res } = makeCtx();
    const result = await mw.before!(ctx);
    expect(result).toEqual({ handled: true });
    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toContain('error="missing_token"');
    expect(res.headers["www-authenticate"]).toContain('realm="MCP"');
    expect(JSON.parse(res.body).error).toBe("missing_token");
  });

  it("passes through with no auth when optional and header is missing", async () => {
    const mw = bearerAuth({ verify: () => ({ user: "x" }), optional: true });
    const { ctx, res } = makeCtx();
    const result = await mw.before!(ctx);
    expect(result).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(ctx.auth).toBeUndefined();
  });

  it("returns 401 invalid_request on malformed Authorization header", async () => {
    const mw = bearerAuth({ verify: () => ({ user: "x" }) });
    const { ctx, res } = makeCtx({ authorization: "Basic abc" });
    const result = await mw.before!(ctx);
    expect(result).toEqual({ handled: true });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("invalid_request");
  });

  it("returns 401 invalid_request on empty bearer token", async () => {
    const mw = bearerAuth({ verify: () => ({ user: "x" }) });
    const { ctx, res } = makeCtx({ authorization: "Bearer    " });
    await mw.before!(ctx);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("invalid_request");
  });

  it("returns 401 invalid_token when verify returns falsy", async () => {
    const mw = bearerAuth({ verify: () => null });
    const { ctx, res } = makeCtx({ authorization: "Bearer bad" });
    await mw.before!(ctx);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("invalid_token");
  });

  it("returns 401 invalid_token when verify throws", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const mw = bearerAuth({
      verify: () => {
        throw new Error("kaboom");
      },
    });
    const { ctx, res } = makeCtx({ authorization: "Bearer x" });
    await mw.before!(ctx);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("invalid_token");
    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });

  it("populates ctx.auth on successful verify", async () => {
    const mw = bearerAuth({
      verify: (token) => {
        expect(token).toBe("good");
        return { user: "u1", scopes: ["read"] };
      },
    });
    const { ctx, res } = makeCtx({ authorization: "Bearer good" });
    const result = await mw.before!(ctx);
    expect(result).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(ctx.auth).toEqual({ user: "u1", scopes: ["read"] });
  });

  it("supports async verify functions", async () => {
    const mw = bearerAuth({
      verify: async (token) => {
        await new Promise((r) => setTimeout(r, 5));
        return { user: token };
      },
    });
    const { ctx } = makeCtx({ authorization: "Bearer t" });
    await mw.before!(ctx);
    expect(ctx.auth?.user).toBe("t");
  });

  it("matches Bearer scheme case insensitively", async () => {
    const mw = bearerAuth({ verify: () => ({ user: "x" }) });
    const { ctx } = makeCtx({ authorization: "bearer abc" });
    await mw.before!(ctx);
    expect(ctx.auth?.user).toBe("x");
  });

  it("uses the configured realm in WWW-Authenticate", async () => {
    const mw = bearerAuth({ verify: () => null, realm: "my-app" });
    const { ctx, res } = makeCtx({ authorization: "Bearer x" });
    await mw.before!(ctx);
    expect(res.headers["www-authenticate"]).toContain('realm="my-app"');
  });

  it("escapes quotes and backslashes in the realm", async () => {
    const mw = bearerAuth({ verify: () => null, realm: 'a"b\\c' });
    const { ctx, res } = makeCtx({ authorization: "Bearer x" });
    await mw.before!(ctx);
    expect(res.headers["www-authenticate"]).toContain('realm="a\\"b\\\\c"');
  });

  it("reads first value when authorization header is an array", async () => {
    const mw = bearerAuth({ verify: () => ({ user: "x" }) });
    const { ctx } = makeCtx({ authorization: ["Bearer first", "Bearer second"] });
    await mw.before!(ctx);
    expect(ctx.auth?.user).toBe("x");
  });
});
