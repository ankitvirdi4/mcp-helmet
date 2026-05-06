---
"mcp-helmet": patch
---

Fix `npx mcp-helmet init` (and any installed-bin invocation) silently
exiting with no output. The CLI's direct-invoke detection used a naive
`import.meta.url === file://${argv[1]}` check, which evaluated false
when the package was installed as a dependency because npm symlinks
`node_modules/.bin/mcp-helmet` to the dist file. Now resolves both
sides via `realpathSync` + `pathToFileURL` before comparing.

Affects every published alpha from 0.1.0-alpha.3 onward. In-repo
smoke (which ran `node dist/cli.js` directly) never tripped this.
