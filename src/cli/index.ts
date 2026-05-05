// `mcp-helmet` CLI entry. Currently exposes one subcommand: `init`.
// Architecture: this file is a thin shell. argv parsing, template
// rendering, and validation live in init.ts. The fs writer is injected
// here so tests can swap in an in-memory writer.

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseInitArgs, runInit, InitError, type InitWriter } from "./init.js";
import { VERSION } from "../version.js";

const HELP = `mcp-helmet ${VERSION}

Usage:
  mcp-helmet init <name> [flags]

Flags:
  --transport <stdio|http|dual>   Default: dual (auto via MCP_TRANSPORT)
  --auth <none|bearer|api-key>    Default: none
  --no-health                     Skip healthCheck() middleware
  --no-shutdown                   Skip gracefulShutdown() middleware
  --no-rate-limit                 Skip rateLimiter() middleware
  --no-docker                     Skip Dockerfile + .dockerignore
  --target-dir <path>             Where to create the project. Default: ./<name>

  -h, --help                      Show this help
  -v, --version                   Print the CLI version

Examples:
  mcp-helmet init my-server
  mcp-helmet init billing --transport http --auth bearer
  mcp-helmet init local-only --transport stdio --no-docker
`;

export async function main(argv: readonly string[]): Promise<number> {
  const subcommand = argv[0];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    process.stdout.write(HELP);
    return 0;
  }
  if (subcommand === "--version" || subcommand === "-v") {
    process.stdout.write(VERSION + "\n");
    return 0;
  }

  if (subcommand !== "init") {
    process.stderr.write(`Unknown command: ${subcommand}\n\n${HELP}`);
    return 1;
  }

  let parsed;
  try {
    parsed = parseInitArgs(argv.slice(1));
  } catch (err) {
    process.stderr.write(formatError(err) + "\n");
    return 1;
  }

  if (parsed.showHelp) {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed.showVersion) {
    process.stdout.write(VERSION + "\n");
    return 0;
  }
  if (!parsed.name) {
    process.stderr.write("Project name is required.\n\n" + HELP);
    return 1;
  }

  const targetDir = resolve(parsed.targetDir ?? parsed.name);

  try {
    const result = await runInit(
      {
        name: parsed.name,
        targetDir,
        transport: parsed.transport,
        auth: parsed.auth,
        health: parsed.health,
        shutdown: parsed.shutdown,
        rateLimit: parsed.rateLimit,
        docker: parsed.docker,
      },
      fsWriter,
    );

    process.stdout.write(`Created ${parsed.name} in ${targetDir}\n\n`);
    process.stdout.write(`Files:\n`);
    for (const f of result.filesWritten) {
      process.stdout.write(`  ${f}\n`);
    }
    process.stdout.write(
      `\nNext:\n  cd ${parsed.name}\n  npm install\n  npm run dev\n`,
    );
    return 0;
  } catch (err) {
    process.stderr.write(formatError(err) + "\n");
    return 1;
  }
}

function formatError(err: unknown): string {
  if (err instanceof InitError) return `error: ${err.message}`;
  if (err instanceof Error) return `error: ${err.message}`;
  return `error: ${String(err)}`;
}

const fsWriter: InitWriter = {
  async isNonEmptyDir(path) {
    try {
      const entries = await readdir(path);
      return entries.length > 0;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return false;
      throw err;
    }
  },
  async mkdirp(path) {
    await mkdir(path, { recursive: true });
  },
  async writeFile(path, contents, mode) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, mode === undefined ? undefined : { mode });
  },
};

// Run when invoked directly (not when imported by tests).
const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(formatError(err) + "\n");
      process.exit(1);
    },
  );
}
