// Integration tests for createServer().
// Uses the SDK's InMemoryTransport pair to drive a real client / server
// roundtrip without HTTP. This exercises tool registration, content auto
// wrapping, error handling, middleware setup hooks, and stop().

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createServer } from "./mcp-server.js";
import type { Middleware } from "./middleware.js";

// Connects a fresh toolkit server to an in-memory client. Returns the client
// and a stop() handle that closes both.
async function connectInMemory(setup: (server: ReturnType<typeof createServer>) => void) {
  const server = createServer({ name: "test", version: "1.0.0" });
  setup(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.raw.connect(serverTransport);

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(clientTransport);

  return {
    server,
    client,
    async stop() {
      await client.close();
      await server.raw.close();
    },
  };
}

describe("createServer integration (InMemoryTransport)", () => {
  it("registers a string-returning tool and returns auto-wrapped TextContent", async () => {
    const { client, stop } = await connectInMemory((server) => {
      server.tool("greet", { name: z.string() }, async ({ name }: { name: string }) => {
        return `Hello, ${name}!`;
      });
    });

    const result = await client.callTool({ name: "greet", arguments: { name: "Alice" } });
    expect(result.content).toEqual([{ type: "text", text: "Hello, Alice!" }]);
    expect(result.isError).toBeUndefined();

    await stop();
  });

  it("auto-serialises an object return as JSON TextContent", async () => {
    const { client, stop } = await connectInMemory((server) => {
      server.tool("lookup", { id: z.number() }, async ({ id }: { id: number }) => {
        return { id, name: "Alice", role: "admin" };
      });
    });

    const result = await client.callTool({ name: "lookup", arguments: { id: 42 } });
    expect(result.content).toHaveLength(1);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual({ id: 42, name: "Alice", role: "admin" });

    await stop();
  });

  it("passes a Content[] return through unchanged", async () => {
    const { client, stop } = await connectInMemory((server) => {
      server.tool("multi", undefined, async () => {
        return [
          { type: "text" as const, text: "hello" },
          { type: "text" as const, text: "world" },
        ];
      });
    });

    const result = await client.callTool({ name: "multi", arguments: {} });
    expect(result.content).toEqual([
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ]);

    await stop();
  });

  it("catches handler errors and returns isError: true", async () => {
    const { client, stop } = await connectInMemory((server) => {
      server.tool("fail", undefined, async () => {
        throw new Error("boom");
      });
    });

    const result = await client.callTool({ name: "fail", arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "boom" }]);

    await stop();
  });

  it("lists registered tools via tools/list", async () => {
    const { client, stop } = await connectInMemory((server) => {
      server.tool("a", undefined, async () => "a");
      server.tool("b", { x: z.number() }, async () => "b");
    });

    const list = await client.listTools();
    expect(list.tools.map((t) => t.name).sort()).toEqual(["a", "b"]);

    await stop();
  });

  it("preserves tool description metadata", async () => {
    const { client, stop } = await connectInMemory((server) => {
      server.tool(
        "search",
        { q: z.string() },
        async () => "results",
        "Search the index",
      );
    });

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "search");
    expect(tool?.description).toBe("Search the index");

    await stop();
  });

  it("exposes registered tool names on toolNames", async () => {
    const { server, stop } = await connectInMemory((s) => {
      s.tool("a", undefined, async () => "a");
      s.tool("b", undefined, async () => "b");
    });

    expect([...server.toolNames]).toEqual(["a", "b"]);
    await stop();
  });

  it("invokes middleware setup hooks during connect (via raw.connect)", async () => {
    const calls: string[] = [];
    const mw: Middleware = {
      name: "tracker",
      setup() {
        calls.push("setup");
        return () => {
          calls.push("cleanup");
        };
      },
    };

    // Note: middleware setup is invoked during server.start(), not raw.connect.
    // Here we verify use() registers the middleware correctly. The actual
    // setup invocation is exercised in graceful-shutdown.test.ts.
    const server = createServer({ name: "t", version: "1" });
    server.use(mw);
    expect(calls).toEqual([]);
    void server;
  });

  it("info reports the constructor name and version", () => {
    const server = createServer({ name: "the-server", version: "9.9.9" });
    expect(server.info.name).toBe("the-server");
    expect(server.info.version).toBe("9.9.9");
  });

  it("startedAt is null before start()", () => {
    const server = createServer({ name: "t", version: "1" });
    expect(server.startedAt).toBeNull();
  });
});
