---
"mcp-helmet": minor
---

Weekend 3: auth middleware and HTTP integration tests.

- Add `bearerAuth({ verify, optional?, realm? })` middleware that reads
  `Authorization: Bearer <token>`, calls a user-supplied verify function,
  populates `ctx.auth`, and rejects with `401` + `WWW-Authenticate` on
  failure.
- Add `apiKeyAuth({ header?, validate, optional? })` middleware. Default
  header is `X-API-Key`. Same accept/reject contract as `bearerAuth`.
- Add AsyncLocalStorage-based auth context. `getAuthContext()` returns
  the verified principal anywhere inside a tool handler's async chain,
  with no change to the tool handler signature.
- Toolkit HTTP handler now wraps `transport.handleRequest` with
  `runWithAuthContext` when middleware sets `ctx.auth`. The wrapper cost
  is paid only when auth is present.
- `start()` now returns `{ stop, transport, port, host }`. When `port: 0`
  is passed, `port` is the OS-assigned port. For stdio transport, `port`
  and `host` are `null`.
- 32 new tests across `auth-context`, `bearerAuth`, `apiKeyAuth`, and a
  real listening-server suite for `mcp-server` HTTP path. 95 tests,
  100% coverage on auth + middleware modules.
