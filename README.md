# mcp-helmet

[![npm](https://img.shields.io/npm/v/mcp-helmet.svg)](https://www.npmjs.com/package/mcp-helmet)
[![CI](https://github.com/ankitvirdi4/mcp-helmet/actions/workflows/ci.yml/badge.svg)](https://github.com/ankitvirdi4/mcp-helmet/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/mcp-helmet.svg)](./LICENSE)
[![Types](https://img.shields.io/npm/types/mcp-helmet.svg)](https://www.npmjs.com/package/mcp-helmet)

> Production middleware for MCP servers. Auth, sessions, health checks, graceful shutdown, transport ergonomics. Composable middleware borrowed in spirit from Express's `helmet`.

`mcp-helmet` wraps the official [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) with the things it doesn't ship: auto transport detection, content wrapping, health checks, graceful shutdown, session management, and auth middleware. One package. Composable. Drop what you don't need. Go from hello world to production in minutes, not days.

```bash
npm install mcp-helmet @modelcontextprotocol/sdk zod
```

> **Peer dependencies:** `@modelcontextprotocol/sdk` ^1.29.0, `zod` ^3.22.0 or ^3.25 (v4). `zod-to-json-schema` is an optional peer for Zod v3 users.

## Quickstart

The fastest way is the scaffolder:

```bash
npx mcp-helmet init my-server --transport http --auth bearer
cd my-server
npm install
npm run dev
```

You get a working MCP server with `healthCheck()`, `gracefulShutdown()`, optional auth, a multistage `Dockerfile`, and a typechecked `tsconfig`. Drop flags to skip pieces (`--no-docker`, `--no-health`, etc.) or customise after the fact.

Or wire it manually:

```typescript
import { createServer } from "mcp-helmet";
import { z } from "zod";

const server = createServer({ name: "hello", version: "1.0.0" });

server.tool("greet", { name: z.string() }, async ({ name }) => {
  return `Hello, ${name}!`;
});

await server.start();
```

That's it. No transport wiring, no content array construction, no signal handlers. Run it:

```bash
# Local development (stdio, the default)
npx tsx src/index.ts

# Production (HTTP)
MCP_TRANSPORT=http PORT=3000 node dist/index.js
```

Same code, both modes.

## Auth in 6 lines

Bearer token verification, with the verified principal available inside any tool handler:

```typescript
import { createServer, bearerAuth, getAuthContext } from "mcp-helmet";

const server = createServer({ name: "secure", version: "1.0.0" });

server.use(bearerAuth({
  verify: async (token) => {
    const claims = await verifyJwt(token); // your call
    return { user: claims.sub, scopes: claims.scope?.split(" ") ?? [] };
  },
}));

server.tool("whoami", {}, async () => {
  const auth = getAuthContext();
  return { user: auth?.user, scopes: auth?.scopes };
});

await server.start();
```

The single-argument tool handler signature stays the same — `getAuthContext()` reads from AsyncLocalStorage, so it works from any depth in the async chain.

## Why this exists

We audited 30 production MCP servers and 320 GitHub issues across the official SDKs. Three patterns kept showing up:

1. **Every server rewrites the same 20-40 lines of setup.** Transport selection, content wrapping, error formatting, signal handling. The SDK gives you the building blocks; this gives you the house.

2. **Servers that work locally break in production.** Docker containers exit after one response, Kubernetes pods lose sessions, no health check for load balancers to probe. 52% of remote MCP endpoints in a recent survey were dead.

3. **Nobody can figure out auth.** "How do I access the bearer token inside my tool?" is the most asked question across both SDK repos.

`mcp-helmet` solves these with composable middleware that extends the SDK without replacing it.

## Status

**v0.1.0-alpha — feature complete.** Currently shipped:

- ✅ `createServer()` with auto content wrapping (string, object, Content[])
- ✅ Auto transport detection via `MCP_TRANSPORT` env var
- ✅ Zod v3 + v4 compatibility shim
- ✅ Composable middleware system (`server.use(mw)`)
- ✅ `healthCheck()` middleware
- ✅ `gracefulShutdown()` middleware
- ✅ `bearerAuth()` and `apiKeyAuth()` middleware with AsyncLocalStorage-based `getAuthContext()`
- ✅ `rateLimiter()` middleware (sliding window, IP- or key-based, standard 429 headers)
- ✅ `requestLog()` middleware (one JSON line per request, captures auth principal automatically)
- ✅ `npx mcp-helmet init` CLI scaffolder + Docker template
- ✅ `examples/` directory with three runnable scenarios

v0.1.0 stable will follow once the alpha cycle has 30+ days of real-world usage. v0.2 is on the [ROADMAP](./CHANGELOG.md): Redis-backed session store, structured logging middleware, Python port via FastMCP plugin.

## How it relates to the official SDK

`mcp-helmet` is **not** a fork, an alternative, or a replacement. It's a convenience layer.

| Concern | Official SDK | mcp-helmet |
|---|---|---|
| Protocol implementation | Yes | No, delegates to SDK |
| Transport classes | Yes | No, wraps SDK transports |
| Tool/resource/prompt registration | Yes | Yes, thinner API |
| OAuth server flows | Yes (in v2 dev) | No, out of scope |
| Bearer/API-key middleware | Express-coupled in v2 | Transport-agnostic, composable |
| Health checks | No | Yes, planned |
| Session externalization | No | Stopgap until upstream SEP |
| Docker/deployment templates | No | Yes, planned |

The SDK is a peer dependency. You bring your own version. If the SDK adds features that overlap, mcp-helmet middleware becomes a thin pass-through.

## Requirements

- Node.js 20+
- `@modelcontextprotocol/sdk` ^1.29.0
- TypeScript 5.4+ (recommended, not required)
- Zod 3.22+ or 3.25+ (v4 via `zod/v4` subpath)

## Contributing

PRs and issues welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, test, and PR conventions.

## Security

See [SECURITY.md](./SECURITY.md) for the responsible disclosure path.

## License

MIT
