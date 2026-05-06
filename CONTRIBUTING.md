# Contributing

Thanks for considering a contribution.

## Setup

```bash
git clone https://github.com/ankitvirdi4/mcp-helmet.git
cd mcp-helmet
npm install
```

## Development

```bash
npm run dev          # tsup watch build
npm run build        # one off build into dist/
npm run typecheck    # tsc noEmit
npm test             # vitest
npm run coverage     # vitest with coverage
npm run bench        # benchmark harness, takes ~30s
```

## Submitting a PR

1. Fork and create a branch off `main`.
2. Make your change. Keep PRs focused. One concern per PR.
3. Add or update tests where it makes sense. Aim for >=90 percent line coverage on touched code.
4. `npm run typecheck`, `npm test`, `npm run build` must all pass.
5. New middleware should: (a) follow the contract in `src/middleware.ts`, (b) include unit tests at 100% line coverage, (c) be exercised end-to-end in `src/mcp-server.http.test.ts` if it touches the HTTP request lifecycle, (d) be added to the benchmark harness if it has measurable per-request overhead, (e) get a section in the main README and an entry in the scaffolder if it's user-facing.
6. Open a PR with a clear summary of the why.

Small PRs land faster. If you're planning something larger, open an issue first.

## Releasing (maintainers)

This project uses [changesets](https://github.com/changesets/changesets):

```bash
npx changeset           # describe the change
npx changeset version   # bump version + write CHANGELOG
git commit && git push
npx changeset publish   # npm publish
```

## Code of conduct

Be kind. Assume good intent.
