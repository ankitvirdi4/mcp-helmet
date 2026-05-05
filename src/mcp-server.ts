// createServer() — the toolkit entry point.
//
// Wraps @modelcontextprotocol/sdk's McpServer with auto content wrapping,
// auto transport detection, a thinner tool-registration API, and a
// composable middleware system. Delegates protocol logic to the SDK.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runWithAuthContext } from "./auth-context.js";
import { wrapToolReturn } from "./content.js";
import type { HttpRequestContext, Middleware, SetupCleanup } from "./middleware.js";
import { resolveTransport } from "./transport.js";
import type {
  ContentItem,
  CreateServerOptions,
  StartOptions,
  ToolReturn,
} from "./types.js";

export type ToolHandler<TInput = unknown> = (
  args: TInput,
) => Promise<ToolReturn> | ToolReturn;

export interface ToolkitServer {
  // The underlying SDK server. Escape hatch for advanced use.
  readonly raw: McpServer;
  // Registered tool names. Useful for health checks, debugging.
  readonly toolNames: readonly string[];
  // Wall clock millisecond timestamp from start() onward, otherwise null.
  readonly startedAt: number | null;
  // Server name + version forwarded from createServer opts.
  readonly info: { name: string; version: string };

  // Register a tool with auto content wrapping and Zod-or-shape input.
  tool(
    name: string,
    inputShape: Record<string, unknown> | unknown | undefined,
    handler: ToolHandler<unknown>,
    description?: string,
  ): void;

  // Append a middleware to the chain. Order matters: middleware appended
  // earlier sees requests first.
  use(middleware: Middleware): void;

  // Connect to the resolved transport and start listening. Returns a stop()
  // handle, plus the resolved transport, port, and host. When port 0 is
  // requested, `port` is the actual OS-assigned port. For stdio, port and
  // host are null.
  start(opts?: StartOptions): Promise<{
    stop: () => Promise<void>;
    transport: "stdio" | "http";
    port: number | null;
    host: string | null;
  }>;
}

export function createServer(opts: CreateServerOptions): ToolkitServer {
  const raw = new McpServer({
    name: opts.name,
    version: opts.version,
    ...(opts.title !== undefined ? { title: opts.title } : {}),
  });

  const middlewares: Middleware[] = [];
  const toolNames: string[] = [];
  let startedAt: number | null = null;

  const server: ToolkitServer = {
    raw,
    get toolNames() {
      return toolNames as readonly string[];
    },
    get startedAt() {
      return startedAt;
    },
    info: { name: opts.name, version: opts.version },
    tool(name, inputShape, handler, description) {
      const wrappedHandler = async (
        input: unknown,
      ): Promise<{ content: ContentItem[]; isError?: boolean }> => {
        try {
          const result = await handler(input);
          return { content: wrapToolReturn(result as ToolReturn) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: message }],
            isError: true,
          };
        }
      };

      if (inputShape === undefined || inputShape === null) {
        const config = description ? { description } : undefined;
        registerToolCompat(raw, name, config, wrappedHandler);
      } else {
        const config: Record<string, unknown> = { inputSchema: inputShape };
        if (description) config.description = description;
        registerToolCompat(raw, name, config, wrappedHandler);
      }
      toolNames.push(name);
    },
    use(mw) {
      middlewares.push(mw);
    },
    async start(startOpts) {
      const resolved = resolveTransport(startOpts);
      const cleanups: SetupCleanup[] = [];

      // Run setup hooks before connecting the transport so middleware can
      // register signal handlers, log transports, etc.
      for (const mw of middlewares) {
        if (mw.setup) {
          const cleanup = await mw.setup(server);
          if (typeof cleanup === "function") cleanups.push(cleanup);
        }
      }

      let stopTransport: () => Promise<void>;
      let actualPort: number | null = null;
      let actualHost: string | null = null;

      if (resolved.transport === "stdio") {
        // stdio mode: middleware `before` hooks do not run because there is
        // no HTTP request lifecycle.
        const { StdioServerTransport } = await import(
          "@modelcontextprotocol/sdk/server/stdio.js"
        );
        redirectConsoleToStderr();
        const transport = new StdioServerTransport();
        await raw.connect(transport);
        stopTransport = async () => {
          await transport.close();
        };
      } else {
        // HTTP transport with middleware chain.
        const { StreamableHTTPServerTransport } = await import(
          "@modelcontextprotocol/sdk/server/streamableHttp.js"
        );
        const http = await import("node:http");
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
        });
        await raw.connect(transport);

        const httpServer = http.createServer(async (req, res) => {
          try {
            const ctx: HttpRequestContext = { req, res };
            for (const mw of middlewares) {
              if (mw.before) {
                const result = await mw.before(ctx);
                if (result && result.handled) return;
              }
            }
            // Wrap MCP transport handling in AsyncLocalStorage so tool
            // handlers downstream can read the auth via getAuthContext().
            // We only pay the wrapper cost when auth was actually set.
            if (ctx.auth) {
              await runWithAuthContext(ctx.auth, () =>
                transport.handleRequest(req, res),
              );
            } else {
              await transport.handleRequest(req, res);
            }
          } catch (err) {
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("content-type", "application/json");
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                }),
              );
            }
          }
        });

        await new Promise<void>((resolve) =>
          httpServer.listen(resolved.port, resolved.host, () => resolve()),
        );

        const addr = httpServer.address();
        if (addr && typeof addr === "object") {
          actualPort = addr.port;
          actualHost = addr.address;
        } else {
          actualPort = resolved.port;
          actualHost = resolved.host;
        }

        stopTransport = async () => {
          await new Promise<void>((resolve, reject) =>
            httpServer.close((err) => (err ? reject(err) : resolve())),
          );
          await transport.close();
        };
      }

      startedAt = Date.now();

      const stop = async (): Promise<void> => {
        // Cleanup middleware in reverse order of setup. Last installed
        // teardown runs first. Each cleanup is best effort: errors logged
        // to stderr but do not prevent later cleanups from running.
        for (const cleanup of cleanups.slice().reverse()) {
          try {
            await cleanup();
          } catch (err) {
            console.error("mcp-helmet: middleware cleanup error:", err);
          }
        }
        await stopTransport();
        startedAt = null;
      };

      return {
        stop,
        transport: resolved.transport,
        port: actualPort,
        host: actualHost,
      };
    },
  };

  return server;
}

// Compatibility helper. SDK's McpServer changed registration shape between
// versions. Calls the closest available registerTool/tool method without
// committing to one signature.
function registerToolCompat(
  raw: McpServer,
  name: string,
  config: Record<string, unknown> | undefined,
  handler: (input: unknown) => Promise<{ content: ContentItem[]; isError?: boolean }>,
): void {
  const anyRaw = raw as unknown as Record<string, unknown>;
  const register = (anyRaw.registerTool ?? anyRaw.tool) as
    | ((name: string, config: unknown, handler: unknown) => unknown)
    | undefined;
  if (typeof register !== "function") {
    throw new Error(
      "mcp-helmet: underlying McpServer does not expose registerTool() or tool(). " +
        "Update @modelcontextprotocol/sdk to >=1.29.",
    );
  }
  register.call(raw, name, config ?? {}, handler);
}

function redirectConsoleToStderr(): void {
  if (typeof process === "undefined" || !process.stderr) return;
  console.log = (...args: unknown[]) => {
    process.stderr.write(args.map(stringify).join(" ") + "\n");
  };
  console.info = console.log;
  console.debug = console.log;
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
