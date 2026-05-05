// Inlined templates for `mcp-helmet init`.
//
// We deliberately do not ship a `templates/` directory of static files.
// Inlining as TS string functions means the templates are bundled into
// the CLI build, no runtime fs.readFile of package-internal paths, no
// glob risk, and snapshot-style tests can exercise the rendering
// directly.

import { VERSION } from "../version.js";

export interface TemplateOptions {
  name: string;
  transport: "stdio" | "http" | "dual";
  auth: "none" | "bearer" | "api-key";
  health: boolean;
  shutdown: boolean;
  rateLimit: boolean;
  docker: boolean;
}

export interface RenderedFile {
  path: string;
  contents: string;
  mode?: number;
}

export function renderScaffold(opts: TemplateOptions): RenderedFile[] {
  const files: RenderedFile[] = [
    { path: "package.json", contents: renderPackageJson(opts) },
    { path: "tsconfig.json", contents: renderTsconfig() },
    { path: ".gitignore", contents: renderGitignore() },
    { path: "src/index.ts", contents: renderIndexTs(opts) },
    { path: "README.md", contents: renderReadme(opts) },
  ];

  if (opts.docker) {
    files.push({ path: "Dockerfile", contents: renderDockerfile(opts) });
    files.push({ path: ".dockerignore", contents: renderDockerignore() });
  }

  return files;
}

function renderPackageJson(opts: TemplateOptions): string {
  const pkg = {
    name: opts.name,
    version: "0.0.1",
    private: true,
    type: "module",
    main: "dist/index.js",
    scripts: {
      build: "tsc -p tsconfig.json",
      start: "node dist/index.js",
      dev: "tsx src/index.ts",
      typecheck: "tsc --noEmit",
    },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.29.0",
      "mcp-helmet": `^${VERSION}`,
      zod: "^3.24.0",
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      tsx: "^4.19.0",
      typescript: "^5.6.0",
    },
    engines: {
      node: ">=20",
    },
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function renderTsconfig(): string {
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: false,
      sourceMap: true,
      outDir: "dist",
      rootDir: "src",
    },
    include: ["src/**/*"],
  };
  return JSON.stringify(tsconfig, null, 2) + "\n";
}

function renderGitignore(): string {
  return ["node_modules", "dist", ".env", "*.log", ".DS_Store", ""].join("\n");
}

function renderDockerignore(): string {
  return [
    "node_modules",
    "dist",
    ".git",
    ".env",
    "*.log",
    "README.md",
    "Dockerfile",
    ".dockerignore",
    ".gitignore",
    "",
  ].join("\n");
}

function renderIndexTs(opts: TemplateOptions): string {
  const imports = ["createServer"];
  if (opts.health) imports.push("healthCheck");
  if (opts.rateLimit) imports.push("rateLimiter");
  if (opts.shutdown) imports.push("gracefulShutdown");
  if (opts.auth === "bearer") imports.push("bearerAuth", "getAuthContext");
  if (opts.auth === "api-key") imports.push("apiKeyAuth", "getAuthContext");

  const lines: string[] = [];
  lines.push(`import { ${imports.join(", ")} } from "mcp-helmet";`);
  lines.push(`import { z } from "zod";`);
  lines.push("");
  lines.push(
    `const server = createServer({ name: "${opts.name}", version: "0.0.1" });`,
  );
  lines.push("");

  if (opts.health) {
    lines.push("// Liveness/readiness probe at /healthz. Default body returns");
    lines.push("// status, tool count, uptime, and version.");
    lines.push("server.use(healthCheck());");
    lines.push("");
  }

  if (opts.rateLimit) {
    lines.push("// 100 requests per minute per client (default: keyed by remote IP).");
    lines.push("// Returns 429 + Retry-After when exceeded. No-op for stdio transport.");
    lines.push("server.use(rateLimiter({ max: 100, windowMs: 60_000 }));");
    lines.push("");
  }

  if (opts.auth === "bearer") {
    lines.push("// Verify the bearer token. Replace this stub with your real");
    lines.push("// verification (JWT, opaque token lookup, etc.). Return an");
    lines.push("// AuthContext on success or null/false to reject.");
    lines.push("server.use(");
    lines.push("  bearerAuth({");
    lines.push("    verify: async (token) => {");
    lines.push('      if (token === "dev-token") {');
    lines.push('        return { user: "dev", scopes: ["read", "write"] };');
    lines.push("      }");
    lines.push("      return null;");
    lines.push("    },");
    lines.push("  }),");
    lines.push(");");
    lines.push("");
  } else if (opts.auth === "api-key") {
    lines.push("// Validate the API key. Replace the stub with a lookup");
    lines.push("// against your store of issued keys.");
    lines.push("server.use(");
    lines.push("  apiKeyAuth({");
    lines.push("    validate: async (key) => {");
    lines.push('      if (key === "dev-key") {');
    lines.push('        return { user: "dev", scopes: ["read"] };');
    lines.push("      }");
    lines.push("      return null;");
    lines.push("    },");
    lines.push("  }),");
    lines.push(");");
    lines.push("");
  }

  if (opts.shutdown) {
    lines.push("// Closes the transport on SIGTERM/SIGINT. 30s timeout.");
    lines.push("server.use(gracefulShutdown());");
    lines.push("");
  }

  if (opts.auth !== "none") {
    lines.push("server.tool(");
    lines.push('  "whoami",');
    lines.push("  {},");
    lines.push("  async () => {");
    lines.push("    const auth = getAuthContext();");
    lines.push('    return { user: auth?.user ?? null, scopes: auth?.scopes ?? null };');
    lines.push("  },");
    lines.push('  "Returns the authenticated principal."');
    lines.push(");");
    lines.push("");
  }

  lines.push("server.tool(");
  lines.push('  "greet",');
  lines.push("  { name: z.string() },");
  lines.push("  async ({ name }: { name: string }) => `Hello, ${name}!`,");
  lines.push('  "Greet someone by name."');
  lines.push(");");
  lines.push("");

  if (opts.transport === "stdio") {
    lines.push("// stdio transport — local development and Claude Desktop.");
    lines.push('await server.start({ transport: "stdio" });');
  } else if (opts.transport === "http") {
    lines.push("// HTTP transport — production.");
    lines.push("const port = Number(process.env.PORT ?? 3000);");
    lines.push("const handle = await server.start({ transport: \"http\", port });");
    lines.push('console.error(`mcp server listening on http://${handle.host}:${handle.port}`);');
  } else {
    lines.push("// Auto transport: MCP_TRANSPORT=http for production, stdio default.");
    lines.push("const handle = await server.start();");
    lines.push("if (handle.transport === \"http\") {");
    lines.push('  console.error(`mcp server listening on http://${handle.host}:${handle.port}`);');
    lines.push("}");
  }

  lines.push("");
  return lines.join("\n");
}

function renderReadme(opts: TemplateOptions): string {
  const lines: string[] = [];
  lines.push(`# ${opts.name}`);
  lines.push("");
  lines.push("MCP server scaffolded with [`mcp-helmet`](https://github.com/ankitvirdi4/mcp-helmet).");
  lines.push("");
  lines.push("## Develop");
  lines.push("");
  lines.push("```bash");
  lines.push("npm install");
  lines.push("npm run dev");
  lines.push("```");
  lines.push("");
  lines.push("## Build");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run build");
  lines.push("npm start");
  lines.push("```");
  lines.push("");

  if (opts.transport !== "stdio") {
    lines.push("## Run over HTTP");
    lines.push("");
    lines.push("```bash");
    if (opts.transport === "dual") {
      lines.push("MCP_TRANSPORT=http PORT=3000 node dist/index.js");
    } else {
      lines.push("PORT=3000 node dist/index.js");
    }
    lines.push("```");
    lines.push("");
  }

  if (opts.health) {
    lines.push("## Health probe");
    lines.push("");
    lines.push("```bash");
    lines.push("curl http://localhost:3000/healthz");
    lines.push("```");
    lines.push("");
  }

  if (opts.rateLimit && opts.transport !== "stdio") {
    lines.push("## Rate limiting");
    lines.push("");
    lines.push("Default: 100 requests per minute per client IP. Tune via the `max` and `windowMs` options in `src/index.ts`. Pass a custom `keyFn` to key by API key or authenticated user instead of IP.");
    lines.push("");
  }

  if (opts.auth === "bearer") {
    lines.push("## Auth");
    lines.push("");
    lines.push("Stub bearer verification accepts the literal token `dev-token`. Replace `verify` in `src/index.ts` with your real check (JWT verification, token lookup, etc.).");
    lines.push("");
    lines.push("```bash");
    lines.push('curl -H "Authorization: Bearer dev-token" http://localhost:3000/');
    lines.push("```");
    lines.push("");
  } else if (opts.auth === "api-key") {
    lines.push("## Auth");
    lines.push("");
    lines.push("Stub API-key validation accepts the literal key `dev-key`. Replace `validate` in `src/index.ts` with your real check.");
    lines.push("");
    lines.push("```bash");
    lines.push('curl -H "X-API-Key: dev-key" http://localhost:3000/');
    lines.push("```");
    lines.push("");
  }

  if (opts.docker) {
    lines.push("## Docker");
    lines.push("");
    lines.push("```bash");
    lines.push(`docker build -t ${opts.name} .`);
    lines.push(`docker run -p 3000:3000 ${opts.name}`);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

function renderDockerfile(opts: TemplateOptions): string {
  const lines: string[] = [];
  lines.push("# syntax=docker/dockerfile:1");
  lines.push("");
  lines.push("FROM node:20-alpine AS build");
  lines.push("WORKDIR /app");
  lines.push("COPY package*.json ./");
  lines.push("RUN npm ci");
  lines.push("COPY tsconfig.json ./");
  lines.push("COPY src ./src");
  lines.push("RUN npm run build");
  lines.push("");
  lines.push("FROM node:20-alpine AS runtime");
  lines.push("WORKDIR /app");
  lines.push("ENV NODE_ENV=production");
  lines.push("COPY package*.json ./");
  lines.push("RUN npm ci --omit=dev");
  lines.push("COPY --from=build /app/dist ./dist");
  lines.push("");

  // HTTP-capable images expose a port and run a HEALTHCHECK against /healthz.
  if (opts.transport !== "stdio") {
    lines.push("EXPOSE 3000");
    if (opts.health) {
      lines.push("");
      lines.push("HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\");
      lines.push("  CMD wget --quiet --spider http://localhost:3000/healthz || exit 1");
    }
    lines.push("");
    if (opts.transport === "dual") {
      lines.push("ENV MCP_TRANSPORT=http");
    }
    lines.push("ENV PORT=3000");
    lines.push("ENV HOST=0.0.0.0");
    lines.push("");
    // Drop privileges. node-alpine ships a `node` user.
    lines.push("USER node");
    lines.push('CMD ["node", "dist/index.js"]');
  } else {
    lines.push("USER node");
    lines.push('CMD ["node", "dist/index.js"]');
  }

  lines.push("");
  return lines.join("\n");
}
