// Middleware contract.
//
// Middleware is a small interface with optional hooks. The toolkit calls
// each hook at the right point in the server lifecycle. Middleware composes
// via `server.use(mw)`; later registrations run later.
//
// v0.1 ships two hooks. More land in later weekends:
//
//   before?: runs on every HTTP request before the MCP transport handles it.
//            Return { handled: true } to short circuit (e.g. /healthz).
//
//   setup?:  runs once when server.start() completes. May return a cleanup
//            callback that runs on server.stop(). Used for signal handlers,
//            log transports, anything that needs paired init/teardown.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthContext } from "./auth-context.js";
import type { ToolkitServer } from "./mcp-server.js";

export interface HttpRequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  // Auth middleware writes the verified principal here. The toolkit reads
  // it after the middleware chain runs and wraps `transport.handleRequest`
  // with `runWithAuthContext` so tool handlers can call `getAuthContext()`.
  auth?: AuthContext;
}

export interface BeforeResult {
  // When true, the middleware fully handled the request and the toolkit
  // should not pass it on to the MCP transport.
  handled: boolean;
}

export type BeforeHook = (
  ctx: HttpRequestContext,
) => Promise<BeforeResult | void> | BeforeResult | void;

export type SetupCleanup = () => Promise<void> | void;

export type SetupHook = (
  server: ToolkitServer,
) => Promise<SetupCleanup | void> | SetupCleanup | void;

export interface Middleware {
  // Human readable name for debugging. Optional but recommended.
  name?: string;
  before?: BeforeHook;
  setup?: SetupHook;
}
