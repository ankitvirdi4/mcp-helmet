// Public entry point for mcp-helmet.
//
// v0.1.0-alpha.4.
// Shipped: createServer, auto content wrapping, auto transport detection,
// Zod v3/v4 compatibility shim, middleware system, healthCheck(),
// gracefulShutdown(), bearerAuth(), apiKeyAuth(), rateLimiter(),
// AsyncLocalStorage-based auth context, `mcp-helmet init` CLI scaffolder
// + Docker templates.

export { VERSION } from "./version.js";

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
export { bearerAuth } from "./middleware/bearer-auth.js";
export type { BearerAuthOptions } from "./middleware/bearer-auth.js";
export { apiKeyAuth } from "./middleware/api-key-auth.js";
export type { ApiKeyAuthOptions } from "./middleware/api-key-auth.js";
export { rateLimiter } from "./middleware/rate-limiter.js";
export type { RateLimiterOptions } from "./middleware/rate-limiter.js";
export { requestLog } from "./middleware/request-log.js";
export type { RequestLogEntry, RequestLogOptions } from "./middleware/request-log.js";

export { getAuthContext, runWithAuthContext } from "./auth-context.js";
export type { AuthContext } from "./auth-context.js";

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
