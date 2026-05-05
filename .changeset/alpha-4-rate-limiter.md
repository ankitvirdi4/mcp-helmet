---
"mcp-helmet": minor
---

Add `rateLimiter()` middleware and wire it into the CLI scaffolder.

- `rateLimiter({ max, windowMs, keyFn?, headers?, message? })` is a
  sliding-window rate limiter. In-memory store, keyed by remote IP
  (with `x-forwarded-for` fallback). Allowed requests get standard
  `x-ratelimit-*` headers; rejected requests get `429` + `retry-after`
  and a JSON body. Setup hook returns a cleanup that clears the
  interval and the store.
- `mcp-helmet init` now installs `rateLimiter()` by default with
  100 req/min/IP. Pass `--no-rate-limit` to opt out.
- 12 unit tests for the middleware + 1 CLI toggle test. 133 tests total.
