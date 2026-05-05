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
```

## Submitting a PR

1. Fork and create a branch off `main`.
2. Make your change. Keep PRs focused. One concern per PR.
3. Add or update tests where it makes sense. Aim for >=90 percent line coverage on touched code.
4. `npm run typecheck`, `npm test`, `npm run build` must all pass.
5. Open a PR with a clear summary of the why.

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
