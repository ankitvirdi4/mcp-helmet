// Public entry point for mcp-helmet.
//
// v0.1.0-alpha.0 — Weekend 1 of 4.
// Shipped: createServer, auto content wrapping, auto transport detection,
// Zod v3/v4 compatibility shim.

export const VERSION = "0.1.0-alpha.0";

export { createServer } from "./mcp-server.js";
export type {
  ToolHandler,
  ToolHandlerArgs,
  ToolkitServer,
} from "./mcp-server.js";

export { wrapToolReturn } from "./content.js";

export { resolveTransport } from "./transport.js";
export type { ResolvedTransport } from "./transport.js";

export {
  detectZodVersion,
  inputShapeToJsonSchema,
  zodToJsonSchema,
} from "./zod-compat.js";
export type { JsonSchema, ZodVersion } from "./zod-compat.js";

export type {
  ContentItem,
  CreateServerOptions,
  ImageContentItem,
  StartOptions,
  TextContentItem,
  ToolReturn,
  Transport,
  UnderlyingMcpServer,
} from "./types.js";
