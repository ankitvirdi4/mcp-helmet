// Async-local auth context.
//
// Auth middleware (bearerAuth, apiKeyAuth) writes the authenticated principal
// into the toolkit's HttpRequestContext. The toolkit wraps the rest of the
// request lifecycle (including MCP transport handling and tool invocation)
// with AsyncLocalStorage so any code path can read the auth via
// getAuthContext().
//
// Tool handlers do NOT receive ctx as a second argument. The single-arg
// handler signature is preserved for DX. Handlers that need auth call
// getAuthContext() from anywhere in their async chain.

import { AsyncLocalStorage } from "node:async_hooks";

export interface AuthContext {
  // Principal identifier. Free-form. Convention: subject claim from JWT,
  // user id from session, key id from API key.
  user?: string;
  // Authorisation scopes / permissions. Convention: OAuth-style scope strings.
  scopes?: readonly string[];
  // Whatever else the verify function returns. The library does not interpret
  // anything outside `user` and `scopes`; user code can stash claims, tags,
  // tenant ids, etc.
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<AuthContext>();

// Read the active auth context. Returns undefined when called outside a
// request scope (e.g. unit tests, scripts, stdio mode).
export function getAuthContext(): AuthContext | undefined {
  return storage.getStore();
}

// Run a function with the given auth context active. The toolkit's HTTP
// handler calls this to wrap MCP transport handling.
export function runWithAuthContext<T>(
  ctx: AuthContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return Promise.resolve(storage.run(ctx, fn));
}
