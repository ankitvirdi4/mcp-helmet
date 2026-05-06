---
"mcp-helmet": minor
---

Add `requestLog()` middleware and an `examples/` directory.

- `requestLog({ logger?, skip?, extra? })` emits one JSON line per HTTP
  request at response completion. Captures method, url, status,
  duration, and the verified principal (when an auth middleware ran).
  Default logger writes to stderr; `/healthz` is skipped by default.
- `examples/` contains three single-file scenarios: stdio greet, HTTP
  with bearer + rate limit, and an audit-logging server tying
  requestLog, bearerAuth, and getAuthContext together. Each runs via
  `npx tsx examples/NN.ts` against the local source.
- 12 new tests for requestLog. 146 tests total.
