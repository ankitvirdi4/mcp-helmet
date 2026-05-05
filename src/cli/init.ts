// `mcp-helmet init [name]` — scaffolds a working MCP server project.
//
// Pure-function entry point: takes parsed flags + a writer, returns
// nothing. The thin wrapper in src/cli/index.ts handles argv parsing,
// console output, and the actual fs.writeFile. Splitting the IO from the
// logic keeps the tests file-system free.

import { renderScaffold, type TemplateOptions } from "./templates.js";

export interface InitOptions extends TemplateOptions {
  // Absolute or relative directory to write the scaffold into. Created
  // if missing. Must be empty (or non-existent); we refuse to clobber.
  targetDir: string;
}

export interface InitWriter {
  // Returns true if the path is an existing non-empty directory. We
  // refuse to scaffold into one of those.
  isNonEmptyDir(path: string): Promise<boolean>;
  mkdirp(path: string): Promise<void>;
  writeFile(path: string, contents: string, mode?: number): Promise<void>;
}

export class InitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitError";
  }
}

export async function runInit(
  opts: InitOptions,
  writer: InitWriter,
): Promise<{ filesWritten: string[] }> {
  validateName(opts.name);

  if (await writer.isNonEmptyDir(opts.targetDir)) {
    throw new InitError(
      `Refusing to scaffold into a non-empty directory: ${opts.targetDir}`,
    );
  }

  await writer.mkdirp(opts.targetDir);

  const files = renderScaffold({
    name: opts.name,
    transport: opts.transport,
    auth: opts.auth,
    health: opts.health,
    shutdown: opts.shutdown,
    docker: opts.docker,
  });

  const written: string[] = [];
  for (const file of files) {
    const fullPath = joinPath(opts.targetDir, file.path);
    await writer.mkdirp(parentDir(fullPath));
    await writer.writeFile(fullPath, file.contents, file.mode);
    written.push(file.path);
  }

  return { filesWritten: written };
}

// Validates a directory/package name against npm rules + filesystem
// safety. Same rules the npm CLI applies, simplified.
export function validateName(name: string): void {
  if (!name) throw new InitError("Project name is required.");
  if (name.length > 214) {
    throw new InitError("Project name must be 214 characters or fewer.");
  }
  if (name !== name.toLowerCase()) {
    throw new InitError("Project name must be lowercase.");
  }
  if (/^[._]/.test(name)) {
    throw new InitError("Project name cannot start with '.' or '_'.");
  }
  if (/[~)('!*\s]/.test(name)) {
    throw new InitError(
      "Project name cannot contain spaces or any of: ~ ( ) ' ! *",
    );
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new InitError(
      "Project name cannot contain a path separator. Use --target-dir for that.",
    );
  }
}

export interface ParsedArgs {
  name: string;
  targetDir?: string;
  transport: "stdio" | "http" | "dual";
  auth: "none" | "bearer" | "api-key";
  health: boolean;
  shutdown: boolean;
  docker: boolean;
  showHelp: boolean;
  showVersion: boolean;
}

// argv parser. Returns a fully-resolved ParsedArgs with defaults filled
// in. The first positional after `init` is the project name.
export function parseInitArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {
    name: "",
    transport: "dual",
    auth: "none",
    health: true,
    shutdown: true,
    docker: true,
    showHelp: false,
    showVersion: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.showHelp = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      args.showVersion = true;
      continue;
    }
    if (arg === "--transport") {
      args.transport = expectEnum(argv[++i], ["stdio", "http", "dual"], "--transport");
      continue;
    }
    if (arg === "--auth") {
      args.auth = expectEnum(argv[++i], ["none", "bearer", "api-key"], "--auth");
      continue;
    }
    if (arg === "--no-docker") {
      args.docker = false;
      continue;
    }
    if (arg === "--no-health") {
      args.health = false;
      continue;
    }
    if (arg === "--no-shutdown") {
      args.shutdown = false;
      continue;
    }
    if (arg === "--target-dir") {
      args.targetDir = expectValue(argv[++i], "--target-dir");
      continue;
    }
    if (arg.startsWith("--")) {
      throw new InitError(`Unknown flag: ${arg}`);
    }
    positional.push(arg);
  }

  if (positional.length > 1) {
    throw new InitError(
      `Expected at most one positional argument (the project name); got ${positional.length}.`,
    );
  }
  args.name = positional[0] ?? "";
  return args;
}

function expectValue(v: string | undefined, flag: string): string {
  if (v === undefined) throw new InitError(`${flag} requires a value.`);
  return v;
}

function expectEnum<T extends string>(
  v: string | undefined,
  allowed: readonly T[],
  flag: string,
): T {
  const value = expectValue(v, flag);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new InitError(
      `${flag} must be one of: ${allowed.join(", ")} (got "${value}").`,
    );
  }
  return value as T;
}

function joinPath(a: string, b: string): string {
  if (a.endsWith("/")) return a + b;
  return `${a}/${b}`;
}

function parentDir(p: string): string {
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return ".";
  return p.slice(0, idx);
}
