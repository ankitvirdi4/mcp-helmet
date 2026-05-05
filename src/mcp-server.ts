// createServer() — the toolkit entry point.
//
// Wraps @modelcontextprotocol/sdk's McpServer with auto content wrapping,
// auto transport detection, and a thinner tool-registration API. Delegates
// all protocol logic to the underlying McpServer.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapToolReturn } from "./content.js";
import { resolveTransport } from "./transport.js";
import type {
  ContentItem,
  CreateServerOptions,
  StartOptions,
  ToolReturn,
} from "./types.js";

export interface ToolHandlerArgs<TInput> {
  args: TInput;
}

export type ToolHandler<TInput = unknown> = (
  args: TInput,
) => Promise<ToolReturn> | ToolReturn;

export interface ToolkitServer {
  // The underlying SDK server. Escape hatch for advanced use.
  readonly raw: McpServer;

  // Register a tool with auto content wrapping and Zod-or-shape input.
  // Input can be a Zod object schema, a raw shape record like { x: z.string() },
  // or undefined for tools that take no input.
  tool(
    name: string,
    inputShape: Record<string, unknown> | unknown | undefined,
    handler: ToolHandler<unknown>,
    description?: string,
  ): void;

  // Connect the underlying McpServer to the resolved transport and start
  // listening. For stdio, returns once connected. For http, starts an
  // http.Server and returns a stop() handle.
  start(opts?: StartOptions): Promise<{ stop: () => Promise<void> }>;
}

export function createServer(opts: CreateServerOptions): ToolkitServer {
  const raw = new McpServer({
    name: opts.name,
    version: opts.version,
    ...(opts.title !== undefined ? { title: opts.title } : {}),
  });

  const tool: ToolkitServer["tool"] = (
    name,
    inputShape,
    handler,
    description,
  ) => {
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
      // No-input tool: register without an input schema.
      const opts = description ? { description } : undefined;
      // McpServer.registerTool accepts optional config + handler.
      registerToolCompat(raw, name, opts, wrappedHandler);
      return;
    }

    // Pass the input shape as-is. The SDK >=1.26 supports raw Zod shapes
    // (ZodRawShape) and wraps them with z.object() internally, and also
    // accepts JSON Schema directly via the inputSchema field.
    const config: Record<string, unknown> = { inputSchema: inputShape };
    if (description) config.description = description;
    registerToolCompat(raw, name, config, wrappedHandler);
  };

  const start: ToolkitServer["start"] = async (startOpts) => {
    const resolved = resolveTransport(startOpts);

    if (resolved.transport === "stdio") {
      const { StdioServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/stdio.js"
      );
      // In stdio mode stdout is the protocol channel; redirect noisy logging
      // to stderr to avoid corrupting the JSON-RPC stream.
      redirectConsoleToStderr();
      const transport = new StdioServerTransport();
      await raw.connect(transport);
      return {
        stop: async () => {
          await transport.close();
        },
      };
    }

    // HTTP transport.
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
        await transport.handleRequest(req, res);
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          );
        }
      }
    });

    await new Promise<void>((resolve) =>
      httpServer.listen(resolved.port, resolved.host, () => resolve()),
    );

    return {
      stop: async () => {
        await new Promise<void>((resolve, reject) =>
          httpServer.close((err) => (err ? reject(err) : resolve())),
        );
        await transport.close();
      },
    };
  };

  return { raw, tool, start };
}

// Compatibility helper. SDK's McpServer changed registration shape between
// versions. This calls the closest available registerTool/tool method without
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
  // Replace console methods that default to stdout. console.error and
  // console.warn already go to stderr, so leave them.
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
