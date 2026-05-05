// bearerAuth() — verifies an `Authorization: Bearer <token>` header.
//
// The toolkit does not interpret tokens. The user supplies a `verify`
// function that returns either a falsy value (rejection) or an
// AuthContext shape (acceptance). On acceptance the middleware writes
// `ctx.auth`, which the toolkit then makes visible to tool handlers via
// `getAuthContext()` (AsyncLocalStorage).
//
// On rejection the middleware short circuits with 401 and a small JSON
// body. The `optional` flag lets unauthenticated requests pass through
// (useful when only a subset of tools require auth and you handle the
// gating inside the handler).

import type { AuthContext } from "../auth-context.js";
import type { Middleware } from "../middleware.js";

export interface BearerAuthOptions {
  // Token verifier. Return an AuthContext object on success, or null /
  // undefined / false on failure. Throwing is also treated as a failure
  // (logged to stderr, not propagated to the client).
  verify: (
    token: string,
  ) => Promise<AuthContext | null | undefined | false> | AuthContext | null | undefined | false;
  // When true, requests with no Authorization header pass through with
  // ctx.auth left unset. Requests that present a header still get
  // verified and rejected on failure. Default false.
  optional?: boolean;
  // WWW-Authenticate `realm` parameter on 401 responses. Default "MCP".
  realm?: string;
}

export function bearerAuth(opts: BearerAuthOptions): Middleware {
  const realm = opts.realm ?? "MCP";

  return {
    name: "bearerAuth",
    async before(ctx) {
      const header = readHeader(ctx.req.headers["authorization"]);

      if (!header) {
        if (opts.optional) return;
        return reject(ctx, realm, "missing_token", "Missing bearer token");
      }

      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (!match) {
        return reject(ctx, realm, "invalid_request", "Malformed Authorization header");
      }
      const token = match[1].trim();
      if (!token) {
        return reject(ctx, realm, "invalid_request", "Empty bearer token");
      }

      let result: AuthContext | null | undefined | false;
      try {
        result = await opts.verify(token);
      } catch (err) {
        process.stderr.write(
          `mcp-helmet bearerAuth: verify threw: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return reject(ctx, realm, "invalid_token", "Token verification failed");
      }

      if (!result) {
        return reject(ctx, realm, "invalid_token", "Invalid bearer token");
      }

      ctx.auth = result;
    },
  };
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function reject(
  ctx: { res: import("node:http").ServerResponse },
  realm: string,
  errorCode: string,
  description: string,
): { handled: true } {
  ctx.res.statusCode = 401;
  ctx.res.setHeader(
    "www-authenticate",
    `Bearer realm="${escapeQuoted(realm)}", error="${errorCode}", error_description="${escapeQuoted(description)}"`,
  );
  ctx.res.setHeader("content-type", "application/json");
  ctx.res.end(JSON.stringify({ error: errorCode, error_description: description }));
  return { handled: true };
}

function escapeQuoted(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
