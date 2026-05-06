// HTTP transport with bearer auth, rate limiting, health check, and a tool
// that reads the verified principal via getAuthContext().
//
// Run from the repo root:
//   npx tsx examples/02-http-bearer-rate-limit.ts
//
// Probe:
//   curl http://127.0.0.1:3000/healthz
//   curl -X POST http://127.0.0.1:3000/                     # 401 missing_token
//   curl -X POST http://127.0.0.1:3000/ -H "Authorization: Bearer dev-token"
//
// Replace the verify stub with your real JWT or token-store check before
// putting this anywhere near production.

import {
  bearerAuth,
  createServer,
  getAuthContext,
  gracefulShutdown,
  healthCheck,
  rateLimiter,
} from "../src/index.js";
import { z } from "zod";

const server = createServer({ name: "secure-greet", version: "1.0.0" });

server.use(healthCheck());
server.use(rateLimiter({ max: 100, windowMs: 60_000 }));
server.use(
  bearerAuth({
    verify: async (token) => {
      if (token === "dev-token") {
        return { user: "dev", scopes: ["read", "write"] };
      }
      return null;
    },
  }),
);
server.use(gracefulShutdown());

server.tool(
  "whoami",
  {},
  async () => {
    const auth = getAuthContext();
    return { user: auth?.user ?? null, scopes: auth?.scopes ?? null };
  },
  "Return the authenticated principal.",
);

server.tool(
  "greet",
  { name: z.string() },
  async ({ name }: { name: string }) => `Hello, ${name}!`,
  "Greet someone by name.",
);

const handle = await server.start({ transport: "http", port: 3000, host: "127.0.0.1" });
console.error(`mcp listening on http://${handle.host}:${handle.port}`);
