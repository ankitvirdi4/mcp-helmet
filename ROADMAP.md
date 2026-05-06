# Roadmap

This document is the long view of where mcp-helmet is going, why, and
what would cause us to stop. It's written for users deciding whether to
adopt and for contributors deciding whether to invest.

It is also the source of truth for "is feature X coming?" Faster than
asking on an issue.

Last updated: 2026-05-06. Current published version: **0.1.0-alpha.5**.

---

## Current state (0.1.0-alpha.5)

Shipped:

- `createServer()` with auto content wrapping (string / object / `Content[]`)
- Auto transport detection via `MCP_TRANSPORT` (stdio / http)
- Zod v3 + v4 compatibility shim
- Composable middleware system (`server.use(mw)`)
- `healthCheck()` middleware (`/healthz`)
- `gracefulShutdown()` middleware (SIGTERM/SIGINT)
- `bearerAuth()` and `apiKeyAuth()` with AsyncLocalStorage `getAuthContext()`
- `rateLimiter()` (sliding window, IP- or key-based)
- `requestLog()` (one JSON line per request, captures auth principal)
- `npx mcp-helmet init` CLI scaffolder + Docker template
- 3 runnable examples in `examples/`
- 146 tests, ~88% line coverage

Known gaps the roadmap addresses below: stateless session externalisation
is unbuilt, no OpenTelemetry instrumentation, no SDK v2 support, the
scaffolder doesn't generate CI or tests, and there are no benchmarks.

---

## How this roadmap works

Three release tiers (v0.1 stable, v0.2, v1.0). Each tier has:

- **Gates** that must be true before we cut the release.
- **Scope** of what ships in it.
- **Effort estimate** in weekend-equivalents (one weekend = ~8 focused hours).
- **What it does NOT include** (anti-scope).

The plan also lists **forcing events** (things outside our control that
change what we ship) and a **kill switch** (the conditions that would
make us archive the project rather than continue).

Roadmap items are subject to user signal. If users file issues that
move a v1.0 item to "we need this now," it can jump tiers. If users
ignore a v0.2 item, it slips or gets cut.

---

## v0.1.0 stable

**Goal:** Promote alpha.5 to a stable v0.1.0 with no new features. This
is a maturity release, not a scope release.

### Gates (all must hold before cutting)

- 30+ days of alpha published with no reported breaking issues.
- At least 3 confirmed real-world users (npm download spikes from a
  single project don't count; "I shipped this in production" via issue
  / Discord / DM does).
- 200+ npm weekly downloads sustained over 14 days.
- 10+ GitHub stars from non-affiliated accounts.
- Zero open issues labeled `bug` from the alpha cycle.
- All public APIs exercised by at least one test.
- README + ROADMAP + CONTRIBUTING + SECURITY in good shape.

### Scope (what changes between alpha.5 and 0.1.0)

- **Stdio path test coverage.** A subprocess-based test that exercises
  the stdio console-redirect path. Closes the one remaining coverage
  gap. ~0.5 weekend.
- **Benchmark harness.** Microbenchmarks for: per-request middleware
  overhead with no middleware, with `requestLog` only, with full stack
  (auth + rate limit + log). Numbers in README so users can budget.
  ~1 weekend.
- **Scaffolder generates a test file and CI workflow.** `npx mcp-helmet
  init` should produce `src/index.test.ts` with one passing test, plus
  `.github/workflows/ci.yml` running typecheck + test. The pitch is
  "production-ready in minutes" so production-ready hygiene must be
  default. ~0.5 weekend.
- **Versioned docs site (optional).** A `docs/` Markdown structure (no
  static site generator yet) so the README doesn't grow into a wall of
  text. Defer if low-priority. ~0.5 weekend.
- **Promotion of `mcp-helmet init` `--auth` flag.** Today it accepts
  `none | bearer | api-key`. Should accept `bearer-jwt` as a separate
  preset that emits a real `verifyJwt` skeleton with a clear placeholder
  (`process.env.JWT_SECRET`) and a comment block on JWKS. ~0.5 weekend.
- **Documentation pass.** Cross-link examples from the README, fix any
  drift between the toolkit README and the fake README, add a
  troubleshooting section ("my tool handler can't see ctx.auth" → install
  order, etc.). ~0.5 weekend.

**Total: ~3 weekends.** Mostly hardening, not features.

### Anti-scope (NOT in v0.1.0)

- No new middleware. No `tracing()`, no `cors()`, no `requestId()`.
  Hold all of those for v0.2.
- No SDK v2 migration. v0.1 stays on `@modelcontextprotocol/sdk ^1.29`.
- No Redis sessions. No structured logging stack (`pino` etc.). The
  default `requestLog` already covers structured logging at the JSON
  level; users who want pino/winston can pass their own logger.
- No internationalisation, no plugin marketplace, no
  framework-specific Express / Fastify / Hono adapters.

---

## v0.2.0 — sessions, observability, ergonomics

**Goal:** Address the production gaps users will hit once they actually
deploy: multi-pod sessions, observability, and the ergonomics of writing
your own middleware.

### Gates

- v0.1.0 has been live for 30+ days.
- 1000+ npm weekly downloads.
- 30+ GitHub stars.
- 5+ filed issues from real users (signal of usage, not just stars).
- At least 1 contributor PR merged from a non-affiliated developer.

If v0.1.0 doesn't hit these gates, v0.2.0 is reconsidered (see kill
switch below).

### Scope

- **`statelessSessions({ store })` middleware.** External session store
  with a pluggable interface. Adapters:
  - `inMemoryStore()` — default, single-pod, no extra deps.
  - `redisStore({ url })` — multi-pod, optional peer dep on `ioredis` or
    `redis`.
  Stopgap until the official Scalable Session Handling SEP lands. When
  the SEP ships, this becomes a thin pass-through. ~2 weekends.
- **`tracing()` middleware (OpenTelemetry).** OTel instrumentation that
  emits spans for each tool call, with auth principal as a span
  attribute. Optional peer dep on `@opentelemetry/api`. Compatible with
  the existing `mcp-otel-go` shape so cross-language correlation works.
  ~1 weekend.
- **`requestId()` middleware.** Reads `x-request-id` from the request
  or generates one, stores it in the auth context (or a new
  `getRequestContext()`), and propagates it through `requestLog` and
  any downstream code. Trivial in isolation but tying the propagation
  together is the value. ~0.5 weekend.
- **`cors()` middleware.** For browser-based MCP clients. Standard CORS
  preflight handling with a sane default (origin allowlist, credentials
  off by default). ~0.5 weekend.
- **`onTool` lifecycle hook.** A new middleware hook that runs around
  tool calls (not just HTTP requests). Lets users do per-tool metrics,
  audit logs, and rate limits. Aligns with the upstream proposal in
  modelcontextprotocol/typescript-sdk#1928 if that lands first. ~1
  weekend.
- **CLI: `mcp-helmet doctor`.** Lints an existing project for
  middleware ordering bugs (e.g., `bearerAuth` after `requestLog`
  means the log line won't have the auth principal), missing
  `gracefulShutdown` in HTTP servers, missing healthcheck. ~1 weekend.
- **CLI: `mcp-helmet generate tool`.** Scaffolds a single tool from a
  Zod schema or a JSON Schema file. Reduces boilerplate for users with
  many tools. ~0.5 weekend.
- **Better TypeScript inference.** Today `server.tool<TInput>(...)`
  needs the user to type the handler. Better path: infer from the
  inputShape directly when it's a `z.object(...)` schema, fall back to
  `unknown` otherwise. Same DX as `tRPC`. ~1 weekend.

**Total: ~7-8 weekends.** A real cycle.

### Anti-scope (NOT in v0.2.0)

- Python port. Different language, different ecosystem, different
  user base. FastMCP already covers Python; we don't need to clone it.
- A managed cloud product. mcp-helmet is a library; there is no
  intent to operate infrastructure for users.
- A plugin marketplace, GUI, or web admin panel.
- Framework-specific adapters (Express, Hono, Fastify wrappers). The
  underlying `@modelcontextprotocol/sdk` already exposes the transports;
  mcp-helmet's middleware is transport-agnostic and doesn't need
  per-framework integration.

---

## v1.0.0 — stable, supported, SDK v2-aligned

**Goal:** Lock the public API. Promise backwards compatibility for the
duration of v1.x. Aligned with whatever shape the official SDK has
landed by then.

### Gates

- v0.2.0 has been live for 60+ days.
- 5000+ npm weekly downloads.
- 100+ GitHub stars.
- 15+ filed issues from real users.
- 3+ contributor PRs merged.
- Either:
  - SDK v2 has shipped a stable `1.x → 2.x` migration path, and
    mcp-helmet has a v2-compatible release branch tested against it; or
  - SDK has explicitly committed to keep v1.x support for a year+ and
    we can ship v1.0 against v1.x with a clear v2 migration plan
    documented.

### Scope

- **Public API freeze.** All exported symbols become part of the
  semver contract. Any change after v1.0.0 follows semver: breaking
  changes go to v2.0.
- **SDK v2 support.** A separate entry point or a peer-dep-conditional
  bundle that works with `@modelcontextprotocol/sdk@^2.0`. Probably
  involves dropping the v3-Zod compat code (v2 uses Standard Schema)
  and updating the middleware contract to whatever public hook v2
  exposes (`onRequest` if our #1238 proposal lands, else the userland
  shim shape).
- **Plugin contract for third-party middleware.** Document the exact
  shape of `Middleware`, what `before`/`setup`/`onTool` guarantee, and
  what custom middleware authors can rely on. Today this is implicit;
  in v1 it becomes explicit.
- **Compatibility test matrix.** CI runs against the last 3 SDK
  releases, both v1.x and v2.x. The matrix is part of every PR.
- **Security audit.** External or community review of the auth code
  paths. Specifically `bearerAuth`'s `WWW-Authenticate` header
  formatting, `apiKeyAuth`'s timing-safe comparison (currently absent
  in `validate` callers — we should provide a helper or document the
  responsibility), `rateLimiter`'s key extraction under proxy headers.

**Total: ~6-10 weekends depending on SDK v2 timing.**

### Anti-scope (NOT in v1.0.0)

- LTS commitment beyond 12 months. v1.x gets bug fixes for ~12 months
  after v2.0.0 ships, then archived.
- Backwards compatibility for v0.1.x. Users on v0.1 must migrate to
  v0.2 first (one minor at a time).

---

## Forcing events (things that change the plan)

These are not under our control. When they happen, we react.

### SDK v2.0.0 ships

The v2 line is currently at `2.0.0-alpha.x`. It restructures into a
monorepo (`@modelcontextprotocol/core`, `/server`, `/client`,
framework-specific packages). Standard Schema replaces Zod-direct.

**Our reaction:**

- Audit the v2 middleware contract on day-one of stable.
- Decide whether to:
  - Ship a `mcp-helmet@^2` line aligned with SDK v2 (preferred), or
  - Stay on `^1.x` and let community fork for v2, or
  - Archive if v2's official middleware story closes our gap entirely.
- The decision happens within 30 days of v2 stable. No earlier (no
  point chasing alpha churn), no later (users will be migrating).

### Upstream lands middleware (issue #1238 resolution)

We have an open proposal for a tightly-scoped `onRequest` public hook
in the SDK. Three possible outcomes:

1. **Maintainers accept the proposal.** We draft the PR (already
   offered). mcp-helmet's middleware system rebases onto the official
   hook in the next minor release. Existing users see no API break;
   internals get simpler and more stable across SDK versions.
2. **Maintainers reaffirm composition.** We stay with the
   `setRequestHandler` shim. Current behaviour preserved. Document
   the divergence so users know what they're opting into.
3. **No decision for 90+ days.** Treat as #2 in practice; revisit at
   v0.2.0 cut.

### Anthropic ships a cloud-managed MCP service

Possible but would change the calculus. mcp-helmet is for
self-hosted servers. If most users move to managed, the addressable
market shrinks. We monitor; we don't pre-emptively pivot.

### A competing toolkit becomes dominant

`fastmcp` is the closest competitor. If it grows to ~10x our adoption
and the maintainer accepts auth/sessions middleware upstream, we
honestly evaluate whether to keep building or contribute to fastmcp
instead. Pride is not a project goal.

---

## Kill switch — when to stop

mcp-helmet was built on a 4-weekend bet. The cost of being wrong is
4 weekends, not 4 months. The kill conditions are simple:

- **At day 90 from v0.1.0-alpha.1 publish:** if npm weekly downloads
  are <100 and GitHub stars are <30, we have not validated demand.
  Archive the repo with a clear "this didn't get traction" README and
  preserve the source for anyone who wants to fork.
- **At day 180:** if v0.1.0 stable hasn't shipped because gates are
  unmet, the project is in a zombie state. Archive.
- **If the SDK ships everything mcp-helmet provides (auth, sessions,
  health, shutdown, rate limit, logging) inside a stable v2.x:**
  archive with a redirect note. The convenience layer is no longer
  needed; we won.

The kill switch is healthy because the alternative is open-ended
maintenance burden on something nobody uses. Better to free the time.

---

## What we are explicitly not building (ever, in this repo)

- A managed hosted service for MCP servers.
- A GUI / web admin panel.
- A plugin marketplace.
- A Python port (use FastMCP).
- An OAuth server (the SDK is shipping that in v2).
- A general-purpose request router or HTTP framework. We compose with
  Node's built-in `http.createServer`; users who want Hono/Fastify can
  bring their own and use mcp-helmet's middleware contract directly.

---

## How to influence this roadmap

- **File an issue.** Real use cases bump priorities. "I need X" with
  context beats "X would be cool."
- **Open a PR.** A working PR that moves a v0.2 item to v0.1 is the
  fastest way to change the plan.
- **Discord / GitHub Discussions** for design questions before code.
- **Email maintainer for security-sensitive matters.** See SECURITY.md.

This roadmap is a snapshot, not a contract. It updates when reality
demands it. The version at the top reflects the last edit.
