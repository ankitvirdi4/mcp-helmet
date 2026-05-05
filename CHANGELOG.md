# Changelog

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
