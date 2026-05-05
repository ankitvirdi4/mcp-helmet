// Public entry point for mcp-helmet.
//
// v0.1.0-alpha.1 — Weekend 2 of 4.
// Shipped: createServer, auto content wrapping, auto transport detection,
// Zod v3/v4 compatibility shim, middleware system, healthCheck() and
// gracefulShutdown() middleware.

export const VERSION = "0.1.0-alpha.1";

export { createServer } from "./mcp-server.js";
export type { ToolHandler, ToolkitServer } from "./mcp-server.js";

export { wrapToolReturn } from "./content.js";

export { resolveTransport } from "./transport.js";
export type { ResolvedTransport } from "./transport.js";

export {
  detectZodVersion,
  inputShapeToJsonSchema,
  zodToJsonSchema,
} from "./zod-compat.js";
export type { JsonSchema, ZodVersion } from "./zod-compat.js";

export { healthCheck } from "./middleware/health-check.js";
export type { HealthCheckOptions } from "./middleware/health-check.js";
export { gracefulShutdown } from "./middleware/graceful-shutdown.js";
export type { GracefulShutdownOptions } from "./middleware/graceful-shutdown.js";

export type {
  BeforeHook,
  BeforeResult,
  HttpRequestContext,
  Middleware,
  SetupCleanup,
  SetupHook,
} from "./middleware.js";

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
