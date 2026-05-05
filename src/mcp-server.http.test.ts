// Integration tests that exercise the HTTP transport path of createServer().
// These bind a real listening server on port 0 (OS assigns), drive it with
// fetch + the SDK's StreamableHTTPClientTransport, and tear down between
// tests. Closes the coverage gap left by the InMemoryTransport-based suite.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { getAuthContext } from "./auth-context.js";
import { createServer, type ToolkitServer } from "./mcp-server.js";
import { apiKeyAuth } from "./middleware/api-key-auth.js";
import { bearerAuth } from "./middleware/bearer-auth.js";
import { healthCheck } from "./middleware/health-check.js";

interface Running {
  server: ToolkitServer;
  url: string;
  stop: () => Promise<void>;
}

async function bootHttp(setup: (s: ToolkitServer) => void): Promise<Running> {
  const server = createServer({ name: "http-test", version: "1.0.0" });
  setup(server);
  const handle = await server.start({ transport: "http", port: 0, host: "127.0.0.1" });
  return {
    server,
    url: `http://127.0.0.1:${handle.port}`,
    stop: handle.stop,
  };
}

describe("createServer HTTP transport (real listening server)", () => {
  let running: Running | null = null;

  beforeEach(() => {
    running = null;
  });

  afterEach(async () => {
    if (running) await running.stop();
    running = null;
  });

  it("boots on port 0 and returns the OS-assigned port + host", async () => {
    running = await bootHttp(() => {});
    const handle = await new Promise<void>((r) => r());
    void handle;
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("healthCheck middleware short-circuits before the MCP transport", async () => {
    running = await bootHttp((s) => {
      s.use(healthCheck());
      s.tool("noop", undefined, async () => "ok");
    });

    const res = await fetch(`${running.url}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.tools).toBe(1);
    expect(body.version).toBe("1.0.0");
  });

  it("bearerAuth returns 401 with WWW-Authenticate when the header is missing", async () => {
    running = await bootHttp((s) => {
      s.use(bearerAuth({ verify: () => ({ user: "u" }) }));
    });

    const res = await fetch(`${running.url}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    const body = await res.json();
    expect(body.error).toBe("missing_token");
  });

  it("bearerAuth returns 401 invalid_token on a rejected token", async () => {
    running = await bootHttp((s) => {
      s.use(bearerAuth({ verify: () => null }));
    });

    const res = await fetch(`${running.url}/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer nope",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid_token");
  });

  it("apiKeyAuth returns 401 missing_key when the header is absent", async () => {
    running = await bootHttp((s) => {
      s.use(apiKeyAuth({ validate: () => ({ user: "u" }) }));
    });

    const res = await fetch(`${running.url}/`, {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("missing_key");
  });

  it("threads bearer auth into the tool handler via getAuthContext()", async () => {
    running = await bootHttp((s) => {
      s.use(
        bearerAuth({
          verify: (token) => {
            if (token === "good") return { user: "alice", scopes: ["read"] };
            return null;
          },
        }),
      );
      s.tool("whoami", undefined, async () => {
        const auth = getAuthContext();
        return { user: auth?.user ?? null, scopes: auth?.scopes ?? null };
      });
    });

    const transport = new StreamableHTTPClientTransport(new URL(running.url), {
      requestInit: { headers: { authorization: "Bearer good" } },
    });
    const client = new Client({ name: "c", version: "1" }, { capabilities: {} });
    await client.connect(transport);

    const result = await client.callTool({ name: "whoami", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ user: "alice", scopes: ["read"] });

    await client.close();
  });

  it("threads api key auth into the tool handler via getAuthContext()", async () => {
    running = await bootHttp((s) => {
      s.use(
        apiKeyAuth({
          validate: (k) => (k === "k1" ? { user: "svc", scopes: [] } : null),
        }),
      );
      s.tool("whoami", undefined, async () => {
        const auth = getAuthContext();
        return { user: auth?.user ?? null };
      });
    });

    const transport = new StreamableHTTPClientTransport(new URL(running.url), {
      requestInit: { headers: { "x-api-key": "k1" } },
    });
    const client = new Client({ name: "c", version: "1" }, { capabilities: {} });
    await client.connect(transport);

    const result = await client.callTool({ name: "whoami", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ user: "svc" });

    await client.close();
  });

  it("returns 500 with the error message when middleware throws", async () => {
    running = await bootHttp((s) => {
      s.use({
        name: "boom",
        before: () => {
          throw new Error("middleware exploded");
        },
      });
    });

    const res = await fetch(`${running.url}/`, { method: "POST", body: "{}" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("middleware exploded");
  });

  it("running healthCheck + bearerAuth lets /healthz pass while gating MCP", async () => {
    running = await bootHttp((s) => {
      s.use(healthCheck());
      s.use(bearerAuth({ verify: () => ({ user: "u" }) }));
      s.tool("noop", undefined, async () => "ok");
    });

    const health = await fetch(`${running.url}/healthz`);
    expect(health.status).toBe(200);

    const mcp = await fetch(`${running.url}/`, { method: "POST", body: "{}" });
    expect(mcp.status).toBe(401);
  });

  it("invokes setup and cleanup hooks through the lifecycle", async () => {
    const calls: string[] = [];
    running = await bootHttp((s) => {
      s.use({
        name: "tracker",
        setup() {
          calls.push("setup");
          return () => {
            calls.push("cleanup");
          };
        },
      });
    });
    expect(calls).toEqual(["setup"]);

    await running.stop();
    running = null;
    expect(calls).toEqual(["setup", "cleanup"]);
  });

  it("startedAt is set after start and resets after stop", async () => {
    running = await bootHttp(() => {});
    expect(typeof running.server.startedAt).toBe("number");
    expect(running.server.startedAt).toBeGreaterThan(0);

    await running.stop();
    expect(running.server.startedAt).toBeNull();
    running = null;
  });
});
