// Minimal stdio MCP server. No HTTP, no auth, no middleware. The "hello world".
//
// Run from the repo root:
//   npx tsx examples/01-stdio-greet.ts
//
// Then connect a client (Claude Desktop, MCP Inspector, etc.) over stdio.

import { createServer } from "../src/index.js";
import { z } from "zod";

const server = createServer({ name: "greet", version: "1.0.0" });

server.tool(
  "greet",
  { name: z.string() },
  async ({ name }: { name: string }) => `Hello, ${name}!`,
  "Greet someone by name.",
);

await server.start({ transport: "stdio" });
