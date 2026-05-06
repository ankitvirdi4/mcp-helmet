# Examples

Single-file, copy-pasteable examples. Each one runs against the local
source via `npx tsx examples/NN.ts`.

| File | What it shows |
|---|---|
| [`01-stdio-greet.ts`](./01-stdio-greet.ts) | Minimal stdio MCP server. No HTTP, no auth. The hello world. |
| [`02-http-bearer-rate-limit.ts`](./02-http-bearer-rate-limit.ts) | HTTP transport with `healthCheck`, `rateLimiter`, `bearerAuth`, `gracefulShutdown`, and a tool that reads the principal via `getAuthContext()`. |
| [`03-audit-logging.ts`](./03-audit-logging.ts) | Same chain as 02, plus `requestLog` for one structured JSON line per request. Shows the `requestLog -> bearerAuth -> getAuthContext` flow. |

## Run any example

```bash
# from repo root
npm install
npx tsx examples/02-http-bearer-rate-limit.ts
```

The HTTP examples bind to `127.0.0.1:3000`. Probe with `curl` from a
second shell.

## Bring your own client

The HTTP examples speak the Streamable HTTP transport. Any compliant
client (the SDK's `StreamableHTTPClientTransport`, MCP Inspector, the
Claude Desktop config) can connect with the right `Authorization` header.
The stdio example connects to anything that spawns an MCP server over
stdin/stdout (Claude Desktop, Inspector in stdio mode).

## Customising

These examples import from `../src/index.js` so they exercise the local
package. In your own project you would import from `mcp-helmet`:

```ts
import { createServer, bearerAuth, getAuthContext } from "mcp-helmet";
```

Everything else stays the same.
