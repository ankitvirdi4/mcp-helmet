// Stdio fixture for src/mcp-server.stdio.test.ts. Spawned as a subprocess
// via StdioClientTransport. Registers one tool whose handler emits a
// marker via console.log so the test can confirm console output is
// redirected to stderr (because stdout carries MCP protocol traffic in
// stdio mode).

import { z } from "zod";
import { createServer } from "../index.js";

const server = createServer({ name: "stdio-fixture", version: "1.0.0" });

server.tool(
  "echo",
  { msg: z.string() },
  async ({ msg }: { msg: string }) => {
    // Fires after server.start() has redirected console.* to stderr.
    // If the redirect is broken this byte stream lands on stdout and
    // corrupts the JSON-RPC framing the client is reading.
    console.log("FIXTURE-LOG-MARKER");
    console.info("FIXTURE-INFO-MARKER");
    console.debug("FIXTURE-DEBUG-MARKER");
    return msg;
  },
  "Echo the input message back.",
);

await server.start({ transport: "stdio" });
