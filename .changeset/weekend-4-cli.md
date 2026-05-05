---
"mcp-helmet": minor
---

Weekend 4: CLI scaffolder, Docker template, generic tool() signature.

- `mcp-helmet init <name>` CLI scaffolds a working MCP server project.
  Flags: `--transport <stdio|http|dual>`, `--auth <none|bearer|api-key>`,
  `--no-docker`, `--no-health`, `--no-shutdown`, `--target-dir`. Templates
  inlined (no glob, no fs reads of package-internal paths).
- Docker template is multistage Node 20-alpine, runs as the unprivileged
  `node` user, ships `HEALTHCHECK` against `/healthz` for HTTP images.
- `server.tool<TInput>()` is now generic. The handler infers its arg
  type from the parameter signature, so destructured-typed callbacks
  (`async ({ name }: { name: string }) => ...`) typecheck under
  `strict: true` in user projects.
- `src/version.ts` becomes the single source of truth for VERSION,
  imported by both the library entry and the CLI bundle.
- `package.json` adds `bin: { "mcp-helmet": "./dist/cli.js" }`.
- 26 new CLI tests + smoke-tested scaffold (init → install → build →
  start → 401 / 200 over real HTTP). 121 tests total.
