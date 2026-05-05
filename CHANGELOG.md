# Changelog

## 0.1.0-alpha.1

### Minor Changes

- Weekend 2 of v0.1 ships the middleware system and two production-grade middleware factories.

  ### Added

  - **Middleware system.** `server.use(middleware)` registers a middleware in the chain. Each middleware exposes optional `before(req, res)` (runs on every HTTP request, can short-circuit) and `setup(server)` (runs once at start, returns optional cleanup callback). Middleware composes left-to-right; cleanup runs in reverse order on stop.
  - **`healthCheck(opts?)` middleware.** Exposes a JSON probe at a configurable path (default `/healthz`). Returns `{ status, tools, uptime, version }` by default; pass a custom `body` callback to override. Matches GET only, ignores query strings, lets MCP transport handle other methods. 10 unit tests.
  - **`gracefulShutdown(opts?)` middleware.** Registers SIGTERM / SIGINT handlers that call the SDK's transport close path with a configurable timeout (default 30s). Removes its own listeners on cleanup so multiple servers don't stack handlers. Defaults to `process.exit(0)` on success, `process.exit(1)` on timeout or close failure. Process and exit can be injected for testing. 7 unit tests.
  - **Integration test harness.** New `mcp-server.test.ts` uses the SDK's `InMemoryTransport.createLinkedPair()` to drive end-to-end client/server roundtrips without HTTP. Exercises tool registration, call flow, content auto-wrapping, error propagation, `tools/list`, and tool descriptions. 10 integration tests.
  - **Server inspectables.** `server.toolNames`, `server.startedAt`, and `server.info` are exposed for middleware consumption (the health check uses all three).

  ### Notes

  - Coverage on `mcp-server.ts` is 40% lines because the in-memory integration tests bypass `start()`'s transport-creation branches (HTTP listener, stdio console redirect). Real listening-server tests are planned for Weekend 3.
  - Middleware system intentionally minimal in v0.1. The `before` and `setup` hooks cover this weekend's needs; future hooks like `onTool` (per-call mutation, planned for Weekend 3 bearer auth) will be added when the use case lands.
  - 56 tests total, 100% line coverage on all middleware modules.

## 0.1.0-alpha.0 (2026-05-05)

Initial scaffold. Weekend 1 of 4.

### Added

- `createServer({ name, version })` wrapping `@modelcontextprotocol/sdk`'s `McpServer`.
- Auto content wrapping: tool handlers can return `string` (becomes `TextContent`), `object` (becomes JSON `TextContent`), or a `Content[]` array (passes through unchanged).
- Auto transport detection: `server.start()` reads `MCP_TRANSPORT` env var (`stdio` default, `http` for `StreamableHTTPServerTransport`). Explicit override via `server.start({ transport, port })`.
- Zod v3 and v4 compatibility shim. Detects schema version (`._zod.def` for v4, `._def.typeName` for v3) and converts to JSON Schema using the appropriate library path. Native `z.toJSONSchema()` for v4, `zod-to-json-schema` for v3 (peer dependency).
- Stdio safety: logging is forced to stderr because stdout is the protocol channel in stdio mode.

### Notes

- Pinned to `@modelcontextprotocol/sdk` ^1.29.0. SDK v2 is in active development; will revisit as v0.2.
- npm package name is `mcp-helmet` because the unscoped `mcp-helmet` is owned by another author. GitHub repo is `mcp-helmet`.
