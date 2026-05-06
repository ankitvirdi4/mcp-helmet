# Changelog

## 0.1.0-alpha.7

### Patch Changes

- **Fix `npx mcp-helmet init` silently exiting when invoked via the installed bin.** When the package is installed as a dependency, npm symlinks `node_modules/.bin/mcp-helmet` to `node_modules/mcp-helmet/dist/cli.js`. The CLI's "is this the entry point?" check compared `import.meta.url` against `file://${process.argv[1]}`, but `argv[1]` was the symlink path while `import.meta.url` was the realpath. The check evaluated false, `main()` never ran, the process exited cleanly with no output. End-to-end installs were broken from alpha.3 onward but the in-repo smoke (which invoked `node dist/cli.js` directly) never tripped over it. The check now resolves both sides via `realpathSync` + `pathToFileURL` before comparison.

Surfaced when scaffolding the `mcp-helmet-fs-example` validation project from the published alpha.6 tarball. Anyone who tried `npx mcp-helmet init` from any prior published alpha hit a no-op.

## 0.1.0-alpha.6

### Patch Changes

- Pre-stable hardening cycle. No new features; preparing for `0.1.0` stable.

  ### Added

  - **Stdio path subprocess test.** `src/mcp-server.stdio.test.ts` spawns a fixture server via `StdioClientTransport`, completes an MCP `initialize` / `listTools` / `callTool` round trip, and asserts that `console.log` / `console.info` / `console.debug` from inside a tool handler are redirected to stderr. Closes the stdio coverage gap. The redirect itself runs in the spawned child where vitest's coverage instrumentation cannot reach, so `mcp-server.ts` line coverage stays at ~80% — that gap is now an instrumentation artifact, not a real one.
  - **Scaffolder generates test file + CI workflow.** `npx mcp-helmet init` now produces `src/server.ts` (config) and `src/index.ts` (start) as separate files, plus `src/server.test.ts` (vitest + `InMemoryTransport`, two passing tests against the `greet` tool), `vitest.config.ts`, and `.github/workflows/ci.yml` (typecheck + test + build on push and PR). Two new opt-out flags: `--no-tests` and `--no-ci`.
  - **`--auth bearer-jwt` preset.** New value for the `--auth` flag. Generates a real JWT verifier built on [`jose`](https://github.com/panva/jose): JWKS via `JWKS_URL`, shared HMAC via `JWT_SECRET`, optional `JWT_ISSUER` / `JWT_AUDIENCE` checks. Adds `jose` to scaffolded dependencies. Generated README has an Auth (JWT) section with a working `curl` example.
  - **Benchmark harness.** `benchmarks/bench.ts` drives a real listening server with `StreamableHTTPClientTransport`, runs five scenarios (bare, +requestLog, +bearerAuth, +rateLimiter, full stack), reports p50 / p95 / p99 / mean latency and req/s as a markdown table. Pre-warms JIT across all scenarios so the first measurement is not biased. `npm run bench`. Sanity gate: exits non-zero if full-stack mean exceeds 5x bare baseline.

  ### Changed

  - **README** gains a Performance section (real numbers from the benchmark harness; full-stack overhead currently 0.98x bare, ie below the noise floor at this scale), a Migrate-from-raw-SDK section with side-by-side before/after, and a Troubleshooting section covering six common questions.
  - **CONTRIBUTING** adds the bench script and a contributor checklist for new middleware (test coverage, integration test, bench entry, README section, scaffolder branch).
  - **mcp-fake-readme** reconciled with shipped reality: scaffolder section lists `bearer-jwt` and `--no-tests` / `--no-ci`, scaffold description mentions the generated test and CI workflow.

  ### Notes

  - 155 tests, all green (+1 from the bearer-jwt preset CLI test, +2 from the stdio subprocess test, +5 from the scaffolder refactor and opt-outs).
  - End-to-end smoke verified: scaffold with `--auth bearer-jwt --transport http` → install local tarball → typecheck → test → build → start → 401 on no auth → 401 on invalid bearer → 200 on a valid HS256-signed JWT.
  - Burn-in window starts at this release. Watching for any regression for 7-14 days before promoting to `0.1.0` stable per the gates in `ROADMAP.md`.

## 0.1.0-alpha.5

### Minor Changes

- Adds structured `requestLog()` middleware and an `examples/` directory with three runnable scenarios.

  ### Added

  - **`requestLog({ logger?, skip?, extra? })` middleware.** One JSON line per HTTP request emitted at response time. Each entry has `ts`, `method`, `url`, `status`, `duration_ms`, plus `user` / `scopes` populated automatically from `getAuthContext()` whenever an auth middleware ran first. Pluggable `logger` (default writes to stderr so dual-mode stdio servers stay safe), pluggable `skip` (default skips `GET /healthz`), and an `extra(req)` hook for injecting request id / tenant id / anything else. Wraps `res.end` and listens for `close` so connections that hang up before completion still emit. 12 unit tests.
  - **`examples/` directory.** Three single-file, copy-pasteable scenarios that run against the local source via `npx tsx`:
    - `01-stdio-greet.ts`: minimal stdio server with one tool.
    - `02-http-bearer-rate-limit.ts`: HTTP transport with `healthCheck`, `rateLimiter`, `bearerAuth`, `gracefulShutdown`, and a `whoami` tool that reads `getAuthContext()`.
    - `03-audit-logging.ts`: same chain plus `requestLog` with a `request_id` extractor, demonstrating the `requestLog → bearerAuth → getAuthContext` flow.
    - `examples/README.md` indexes them with run instructions.

  ### Notes

  - 146 tests, all green (+12 from `requestLog`).
  - End-to-end smoke verified: `examples/03-audit-logging.ts` emits a JSON line with `user: "dev"`, `scopes: ["audit"]`, `status: 200` for an authenticated MCP `initialize`, and a `status: 401` line with no user for an unauthenticated request.

## 0.1.0-alpha.4

### Minor Changes

- Adds `rateLimiter()` middleware and wires it into the CLI scaffolder.

  ### Added

  - **`rateLimiter({ max, windowMs, keyFn?, headers?, message? })` middleware.** Sliding window rate limiter, in-memory by default, keyed by remote IP (with `x-forwarded-for` fallback for reverse-proxied setups). Custom `keyFn` supports keying by API key, authenticated user, or anything else from the request. Allowed requests get `x-ratelimit-limit` / `x-ratelimit-remaining` / `x-ratelimit-reset` headers; rejected requests get `429` plus `retry-after` and a JSON body. Setup hook returns a cleanup that clears the interval and the in-memory store. 12 unit tests.
  - **CLI `--no-rate-limit` flag.** `mcp-helmet init` now installs `rateLimiter()` by default. Pass `--no-rate-limit` to opt out. Generated `src/index.ts` includes a sane default (100 requests / minute / IP). For stdio transport the middleware is a no-op since there is no HTTP request lifecycle, so leaving it on is harmless.
  - **README section in scaffolded projects.** When rate limiting is on and the transport includes HTTP, the generated README explains how to tune `max` / `windowMs` and how to swap the default IP-based key for an API-key or user-based key.

  ### Notes

  - 133 tests, all green (+12 from `rateLimiter`, +1 covering the CLI toggle).
  - Persistent / Redis-backed store and per-tool buckets stay out of scope for v0.1; planned for v0.2 alongside the session externalisation stopgap.

## 0.1.0-alpha.3

### Minor Changes

- Weekend 4 ships the `mcp-helmet init` CLI scaffolder, the Docker template, and a generic-inferring `tool()` signature. v0.1 is now feature-complete.

  ### Added

  - **`mcp-helmet init <name>` CLI.** One command produces a working MCP server project with `package.json`, `tsconfig.json`, `src/index.ts`, `README.md`, optional `Dockerfile` + `.dockerignore`, and `.gitignore`. Templates are inlined into the CLI bundle (no glob, no fs reads of package-internal paths). Flags: `--transport <stdio|http|dual>`, `--auth <none|bearer|api-key>`, `--no-docker`, `--no-health`, `--no-shutdown`, `--target-dir <path>`. Defaults are deployment-ready: dual transport, health and shutdown middleware on, Dockerfile included.
  - **Docker template.** Multistage Node 20-alpine, runs as the unprivileged `node` user, includes `HEALTHCHECK` against `/healthz` for HTTP-capable images, sets `MCP_TRANSPORT=http` for dual-mode images. Stdio-mode images skip the `EXPOSE` and `HEALTHCHECK` directives.
  - **Generic-inferring `tool()` signature.** `server.tool<TInput>(name, shape, handler)` infers `TInput` from the handler's parameter, so `async ({ name }: { name: string }) => ...` typechecks under `strict: true` in user projects. The toolkit's own tests already used this pattern (vitest doesn't typecheck by default); the scaffolder's `tsc --noEmit` exposed the gap. Closing it improves DX for everyone.
  - **`src/version.ts`.** Single source of truth for the version constant, imported by both the library entry and the CLI bundle. Lets the CLI build avoid pulling in the rest of the library through the index barrel.

  ### Changed

  - **`package.json` `bin`.** Adds `"mcp-helmet": "./dist/cli.js"` so `npx mcp-helmet init` Just Works once installed.
  - **tsup config** is now an array with two entries: the library (ESM + CJS + dts) and the CLI (ESM only, with `#!/usr/bin/env node` banner, no dts).

  ### Notes

  - 121 tests, all green. CLI suite covers argv parsing (defaults, enum validation, unknown flags, multi-positional rejection), name validation (npm rules), and renderer output for every flag combination via an in-memory writer.
  - Scaffold is end-to-end verified: `init smoke --transport http --auth bearer` → `npm install` → `npm run build` → `node dist/index.js` → `/healthz` returns 200, unauthed POST returns 401, MCP `initialize` over `Authorization: Bearer dev-token` succeeds.
  - v0.1.0 stable will follow once the alpha cycle has 30+ days of real-world usage and no breaking-change asks.

## 0.1.0-alpha.2

### Minor Changes

- Weekend 3 of v0.1 ships auth middleware and the AsyncLocalStorage-based auth context, plus a real listening-server integration suite that closes the previous HTTP-path coverage gap.

  ### Added

  - **`bearerAuth({ verify, optional?, realm? })` middleware.** Reads `Authorization: Bearer <token>`, calls the user's verify function, and on success populates `ctx.auth`. On failure, returns `401` with a properly formatted `WWW-Authenticate` header (escaped realm, `error` and `error_description` parameters). The `optional` flag passes unauthenticated requests through with no `ctx.auth`. 12 unit tests.
  - **`apiKeyAuth({ header?, validate, optional? })` middleware.** Reads a configurable header (default `X-API-Key`, case insensitive). Same accept/reject contract as `bearerAuth`. 10 unit tests.
  - **AsyncLocalStorage auth context.** `getAuthContext()` returns the verified principal from anywhere inside an async chain — including deep inside tool handlers — without changing the single-arg handler signature. The toolkit's HTTP handler wraps `transport.handleRequest` with `runWithAuthContext` whenever middleware writes `ctx.auth`. Wrapper cost is paid only when auth is present. 6 unit tests.
  - **Real listening-server tests for `mcp-server.ts`.** New suite binds an HTTP server on port 0, drives it with `fetch` and the SDK's `StreamableHTTPClientTransport`, and verifies: health-check short-circuit, bearer rejection / acceptance, api-key rejection / acceptance, end-to-end auth → `getAuthContext()` propagation inside a tool handler, middleware-throws → 500, and the lifecycle of `setup` / `cleanup` hooks. 11 integration tests.
  - **Resolved address on `start()` return.** `start()` now returns `{ stop, transport, port, host }`. When `port: 0` is requested, `port` is the OS-assigned ephemeral port. For stdio, `port` and `host` are `null`.

  ### Notes

  - 95 tests total, all green. Coverage now 88% lines overall (up from ~70%); auth and middleware modules at 100%. The remaining `mcp-server.ts` gap is the stdio console-redirect path, which requires subprocess testing — deferred to a later weekend.
  - The middleware contract intentionally exposes a `ctx.auth` field of type `AuthContext` rather than a separate `setAuth()` method. Custom auth schemes (mTLS client cert, signed cookies, JWKS-validated JWT) follow the same pattern as the shipped `bearerAuth` / `apiKeyAuth`: write `ctx.auth` from `before()`, the toolkit handles the rest.

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
