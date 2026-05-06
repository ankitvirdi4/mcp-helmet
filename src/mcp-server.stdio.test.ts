// Subprocess test for the stdio transport branch of createServer().
//
// The HTTP path is covered by mcp-server.http.test.ts. The stdio branch
// imports StdioServerTransport, redirects console.log to stderr, and
// connects raw streams. None of that runs under the InMemoryTransport
// or HTTP suites. This test spawns a real Node child process, does a
// full MCP round trip, and verifies the console.log -> stderr redirect.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const FIXTURE = "src/__fixtures__/stdio-fixture.ts";

describe("createServer stdio transport (subprocess)", () => {
  it("completes an MCP round trip and redirects console.log to stderr", async () => {
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", FIXTURE],
      stderr: "pipe",
    });

    // Capture stderr in the background. The fixture's tool handler
    // fires console.log/info/debug; if the redirect is in place, the
    // marker lands here. If it's leaking to stdout (the bug this test
    // guards against), the bytes corrupt the JSON-RPC framing on
    // stdout and the round trip below either fails or returns garbage.
    const stderrChunks: string[] = [];
    transport.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });

    const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);

    // tools/list works.
    const list = await client.listTools();
    expect(list.tools.map((t) => t.name)).toEqual(["echo"]);

    // tools/call works.
    const result = await client.callTool({ name: "echo", arguments: { msg: "hello" } });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toBe("hello");

    await client.close();

    // Give the child a beat to flush stderr, then assert.
    await new Promise((r) => setTimeout(r, 50));
    const stderr = stderrChunks.join("");
    expect(stderr).toContain("FIXTURE-LOG-MARKER");
    expect(stderr).toContain("FIXTURE-INFO-MARKER");
    expect(stderr).toContain("FIXTURE-DEBUG-MARKER");
  }, 30_000);

  it("invalid arguments to a stdio tool surface as an isError result, not a transport break", async () => {
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", FIXTURE],
      stderr: "pipe",
    });
    const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);

    // Wrong argument shape: msg should be a string.
    const result = await client.callTool({
      name: "echo",
      arguments: { msg: 123 } as unknown as Record<string, string>,
    });
    expect(result.isError).toBe(true);

    // Transport is still healthy.
    const ok = await client.callTool({ name: "echo", arguments: { msg: "still alive" } });
    expect(ok.isError).toBeFalsy();
    expect((ok.content as Array<{ text: string }>)[0].text).toBe("still alive");

    await client.close();
  }, 30_000);
});
