---
"mcp-helmet": patch
---

Pre-stable hardening for v0.1.0. No new features.

- Stdio path subprocess test that completes a full MCP round trip and
  verifies console.log/info/debug redirect to stderr inside the spawned
  child, closing the stdio coverage gap.
- Scaffolder splits index.ts (start) from server.ts (config) and now
  generates a passing vitest test, vitest config, and a GitHub Actions
  CI workflow. New --no-tests and --no-ci opt-outs.
- New --auth bearer-jwt preset. Generates a real jose-based JWT
  verifier with JWKS_URL or JWT_SECRET, optional JWT_ISSUER and
  JWT_AUDIENCE checks. Adds jose to scaffolded deps. Generated README
  documents the env vars.
- Benchmark harness in benchmarks/. `npm run bench` reports
  p50/p95/p99/mean/rps across five scenarios. Pre-warms JIT to avoid
  ordering bias. Exits non-zero if full-stack mean exceeds 5x baseline.
- README gains a Performance section with real numbers
  (full-stack overhead 0.98x bare at this scale), a Migrate-from-the-
  raw-SDK section, and a Troubleshooting section.
- CONTRIBUTING adds a contributor checklist for new middleware.
