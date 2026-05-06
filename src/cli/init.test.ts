import { describe, expect, it } from "vitest";
import { InitError, parseInitArgs, runInit, validateName, type InitWriter } from "./init.js";

function makeMemWriter(existing: Set<string> = new Set()): InitWriter & {
  files: Map<string, string>;
  dirs: Set<string>;
} {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    async isNonEmptyDir(path) {
      return existing.has(path);
    },
    async mkdirp(path) {
      dirs.add(path);
    },
    async writeFile(path, contents) {
      files.set(path, contents);
    },
  };
}

describe("validateName", () => {
  it("accepts a typical lowercase package name", () => {
    expect(() => validateName("my-server")).not.toThrow();
    expect(() => validateName("a")).not.toThrow();
    expect(() => validateName("a-b-c")).not.toThrow();
  });

  it("rejects empty names", () => {
    expect(() => validateName("")).toThrow(InitError);
  });

  it("rejects uppercase", () => {
    expect(() => validateName("MyServer")).toThrow(/lowercase/);
  });

  it("rejects names starting with . or _", () => {
    expect(() => validateName(".hidden")).toThrow();
    expect(() => validateName("_private")).toThrow();
  });

  it("rejects names with spaces or special chars", () => {
    expect(() => validateName("my server")).toThrow();
    expect(() => validateName("my(server)")).toThrow();
    expect(() => validateName("my!server")).toThrow();
  });

  it("rejects path separators", () => {
    expect(() => validateName("foo/bar")).toThrow(/path separator/);
    expect(() => validateName("foo\\bar")).toThrow(/path separator/);
  });

  it("rejects names over 214 chars", () => {
    expect(() => validateName("a".repeat(215))).toThrow(/214/);
  });
});

describe("parseInitArgs", () => {
  it("uses sensible defaults when only the name is given", () => {
    const a = parseInitArgs(["my-server"]);
    expect(a.name).toBe("my-server");
    expect(a.transport).toBe("dual");
    expect(a.auth).toBe("none");
    expect(a.health).toBe(true);
    expect(a.shutdown).toBe(true);
    expect(a.rateLimit).toBe(true);
    expect(a.docker).toBe(true);
    expect(a.tests).toBe(true);
    expect(a.ci).toBe(true);
  });

  it("parses --no-tests and --no-ci", () => {
    const a = parseInitArgs(["my-server", "--no-tests", "--no-ci"]);
    expect(a.tests).toBe(false);
    expect(a.ci).toBe(false);
  });

  it("parses --transport, --auth, and the --no-* flags", () => {
    const a = parseInitArgs([
      "my-server",
      "--transport",
      "http",
      "--auth",
      "bearer",
      "--no-docker",
      "--no-health",
      "--no-rate-limit",
    ]);
    expect(a.transport).toBe("http");
    expect(a.auth).toBe("bearer");
    expect(a.docker).toBe(false);
    expect(a.health).toBe(false);
    expect(a.shutdown).toBe(true);
    expect(a.rateLimit).toBe(false);
  });

  it("rejects unknown values for --transport / --auth", () => {
    expect(() => parseInitArgs(["my-server", "--transport", "ws"])).toThrow(/--transport/);
    expect(() => parseInitArgs(["my-server", "--auth", "magic"])).toThrow(/--auth/);
  });

  it("rejects unknown flags", () => {
    expect(() => parseInitArgs(["my-server", "--turbo"])).toThrow(/Unknown flag/);
  });

  it("captures --target-dir", () => {
    const a = parseInitArgs(["my-server", "--target-dir", "/tmp/here"]);
    expect(a.targetDir).toBe("/tmp/here");
  });

  it("rejects multiple positional arguments", () => {
    expect(() => parseInitArgs(["foo", "bar"])).toThrow(/at most one positional/);
  });

  it("recognises --help and --version", () => {
    expect(parseInitArgs(["--help"]).showHelp).toBe(true);
    expect(parseInitArgs(["--version"]).showVersion).toBe(true);
  });

  it("requires a value for flags that take one", () => {
    expect(() => parseInitArgs(["my-server", "--transport"])).toThrow(/--transport/);
    expect(() => parseInitArgs(["my-server", "--target-dir"])).toThrow(/--target-dir/);
  });
});

describe("runInit", () => {
  it("writes the canonical file set with default options", async () => {
    const writer = makeMemWriter();
    const result = await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "dual",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: true,
      },
      writer,
    );

    expect(result.filesWritten.sort()).toEqual([
      ".dockerignore",
      ".github/workflows/ci.yml",
      ".gitignore",
      "Dockerfile",
      "README.md",
      "package.json",
      "src/index.ts",
      "src/server.test.ts",
      "src/server.ts",
      "tsconfig.json",
      "vitest.config.ts",
    ]);
    expect(writer.files.has("/tmp/demo/package.json")).toBe(true);
    expect(writer.files.has("/tmp/demo/src/server.ts")).toBe(true);
    expect(writer.files.has("/tmp/demo/src/index.ts")).toBe(true);
    expect(writer.files.has("/tmp/demo/src/server.test.ts")).toBe(true);
    expect(writer.files.has("/tmp/demo/vitest.config.ts")).toBe(true);
    expect(writer.files.has("/tmp/demo/.github/workflows/ci.yml")).toBe(true);
    expect(writer.dirs.has("/tmp/demo")).toBe(true);
    expect(writer.dirs.has("/tmp/demo/src")).toBe(true);
  });

  it("omits test files when --no-tests and CI when --no-ci", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "stdio",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: false,
        ci: false,
        docker: false,
      },
      writer,
    );
    expect(writer.files.has("/tmp/demo/src/server.test.ts")).toBe(false);
    expect(writer.files.has("/tmp/demo/vitest.config.ts")).toBe(false);
    expect(writer.files.has("/tmp/demo/.github/workflows/ci.yml")).toBe(false);

    const pkg = JSON.parse(writer.files.get("/tmp/demo/package.json")!);
    expect(pkg.devDependencies.vitest).toBeUndefined();
    expect(pkg.scripts.test).toBeUndefined();
  });

  it("generated server.ts is importable; index.ts only calls start", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "dual",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: false,
      },
      writer,
    );
    const serverTs = writer.files.get("/tmp/demo/src/server.ts")!;
    const indexTs = writer.files.get("/tmp/demo/src/index.ts")!;
    expect(serverTs).toContain("export const server = createServer");
    expect(indexTs).toContain('import { server } from "./server.js"');
    expect(indexTs).toContain("server.start");
    expect(indexTs).not.toContain("createServer(");
  });

  it("generated test file imports from ./server.js and exercises greet", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "stdio",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: false,
        docker: false,
      },
      writer,
    );
    const test = writer.files.get("/tmp/demo/src/server.test.ts")!;
    expect(test).toContain('from "./server.js"');
    expect(test).toContain("InMemoryTransport");
    expect(test).toContain('"greet"');
  });

  it("generated CI workflow runs typecheck, test, and build", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "dual",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: false,
      },
      writer,
    );
    const ci = writer.files.get("/tmp/demo/.github/workflows/ci.yml")!;
    expect(ci).toContain("npm run typecheck");
    expect(ci).toContain("npm run test:run");
    expect(ci).toContain("npm run build");
    expect(ci).toContain("node-version: 20");
  });

  it("omits the test step from CI when tests are disabled", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "dual",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: false,
        ci: true,
        docker: false,
      },
      writer,
    );
    const ci = writer.files.get("/tmp/demo/.github/workflows/ci.yml")!;
    expect(ci).not.toContain("test:run");
    expect(ci).toContain("typecheck");
  });

  it("omits Docker files when --no-docker", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "stdio",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: false,
      },
      writer,
    );
    expect(writer.files.has("/tmp/demo/Dockerfile")).toBe(false);
    expect(writer.files.has("/tmp/demo/.dockerignore")).toBe(false);
  });

  it("includes bearerAuth wiring when --auth bearer", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "http",
        auth: "bearer",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: true,
      },
      writer,
    );
    const index = writer.files.get("/tmp/demo/src/server.ts")!;
    expect(index).toContain("bearerAuth");
    expect(index).toContain("getAuthContext");
    expect(index).toContain('verify: async (token)');
    expect(index).not.toContain("apiKeyAuth");
  });

  it("includes apiKeyAuth wiring when --auth api-key", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "http",
        auth: "api-key",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: true,
      },
      writer,
    );
    const index = writer.files.get("/tmp/demo/src/server.ts")!;
    expect(index).toContain("apiKeyAuth");
    expect(index).toContain("validate: async (key)");
    expect(index).not.toContain("bearerAuth");
  });

  it("omits health and shutdown wiring when toggled off", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "stdio",
        auth: "none",
        health: false,
        shutdown: false,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: false,
      },
      writer,
    );
    const index = writer.files.get("/tmp/demo/src/server.ts")!;
    expect(index).not.toContain("healthCheck");
    expect(index).not.toContain("gracefulShutdown");
  });

  it("includes rateLimiter wiring by default and omits it when --no-rate-limit", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "http",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: false,
      },
      writer,
    );
    const onIndex = writer.files.get("/tmp/demo/src/server.ts")!;
    expect(onIndex).toContain("rateLimiter");
    expect(onIndex).toContain("server.use(rateLimiter(");

    const writer2 = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/other",
        transport: "http",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: false,
        tests: true,
        ci: true,
        docker: false,
      },
      writer2,
    );
    const offIndex = writer2.files.get("/tmp/other/src/server.ts")!;
    expect(offIndex).not.toContain("rateLimiter");
  });

  it("renders a stdio-only Dockerfile without EXPOSE / HEALTHCHECK", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "stdio",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: true,
      },
      writer,
    );
    const dockerfile = writer.files.get("/tmp/demo/Dockerfile")!;
    expect(dockerfile).not.toContain("EXPOSE");
    expect(dockerfile).not.toContain("HEALTHCHECK");
    expect(dockerfile).toContain("USER node");
  });

  it("renders HTTP Dockerfile with EXPOSE, HEALTHCHECK, and PORT env", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "http",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: true,
      },
      writer,
    );
    const dockerfile = writer.files.get("/tmp/demo/Dockerfile")!;
    expect(dockerfile).toContain("EXPOSE 3000");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("ENV PORT=3000");
    expect(dockerfile).not.toContain("MCP_TRANSPORT");
  });

  it("dual-transport Dockerfile sets MCP_TRANSPORT=http", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "dual",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: true,
      },
      writer,
    );
    expect(writer.files.get("/tmp/demo/Dockerfile")!).toContain("ENV MCP_TRANSPORT=http");
  });

  it("refuses to scaffold into a non-empty directory", async () => {
    const writer = makeMemWriter(new Set(["/tmp/existing"]));
    await expect(
      runInit(
        {
          name: "demo",
          targetDir: "/tmp/existing",
          transport: "dual",
          auth: "none",
          health: true,
          shutdown: true,
          rateLimit: true,
          tests: true,
          ci: true,
          docker: true,
        },
        writer,
      ),
    ).rejects.toThrow(/non-empty/);
  });

  it("validates the project name before doing any IO", async () => {
    const writer = makeMemWriter();
    await expect(
      runInit(
        {
          name: "Bad Name",
          targetDir: "/tmp/bad",
          transport: "dual",
          auth: "none",
          health: true,
          shutdown: true,
          rateLimit: true,
          tests: true,
          ci: true,
          docker: true,
        },
        writer,
      ),
    ).rejects.toThrow(InitError);
    expect(writer.files.size).toBe(0);
  });

  it("emits a parseable package.json that depends on mcp-helmet", async () => {
    const writer = makeMemWriter();
    await runInit(
      {
        name: "demo",
        targetDir: "/tmp/demo",
        transport: "dual",
        auth: "none",
        health: true,
        shutdown: true,
        rateLimit: true,
        tests: true,
        ci: true,
        docker: false,
      },
      writer,
    );
    const pkg = JSON.parse(writer.files.get("/tmp/demo/package.json")!);
    expect(pkg.name).toBe("demo");
    expect(pkg.dependencies["mcp-helmet"]).toMatch(/^\^0\./);
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();
    expect(pkg.dependencies.zod).toBeDefined();
    expect(pkg.scripts.build).toContain("tsc");
    expect(pkg.scripts.dev).toContain("tsx");
  });
});
