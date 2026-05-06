// HTTP server that emits a structured audit log line per request, including
// the authenticated user when present. Demonstrates the requestLog ->
// bearerAuth -> getAuthContext flow.
//
// Run from the repo root:
//   npx tsx examples/03-audit-logging.ts
//
// Then in another shell:
//   curl http://127.0.0.1:3000/healthz                                          # skipped from log
//   curl -X POST http://127.0.0.1:3000/ -H "Authorization: Bearer dev-token" \
//        -H "content-type: application/json" \
//        -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}'
//
// One JSON line per request lands on stderr. Pipe into jq, ship to Loki, etc.

import {
  bearerAuth,
  createServer,
  getAuthContext,
  gracefulShutdown,
  healthCheck,
  requestLog,
} from "../src/index.js";

const server = createServer({ name: "audited", version: "1.0.0" });

// healthCheck runs first so /healthz short-circuits before reaching the
// log + auth chain.
server.use(healthCheck());

// requestLog before bearerAuth: the start time is captured first, but the
// log line is emitted at res.end, by which point bearerAuth has populated
// the auth store. Capturing a request id from a header here is a common
// extension point.
server.use(
  requestLog({
    extra: (req) => ({
      request_id: (req.headers["x-request-id"] as string) ?? crypto.randomUUID(),
    }),
  }),
);

server.use(
  bearerAuth({
    verify: async (token) =>
      token === "dev-token" ? { user: "dev", scopes: ["audit"] } : null,
  }),
);

server.use(gracefulShutdown());

server.tool(
  "whoami",
  {},
  async () => {
    const auth = getAuthContext();
    return { user: auth?.user ?? null };
  },
  "Return the authenticated principal.",
);

const handle = await server.start({ transport: "http", port: 3000, host: "127.0.0.1" });
console.error(`audited mcp listening on http://${handle.host}:${handle.port}`);
