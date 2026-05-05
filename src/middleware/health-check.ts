// healthCheck() — exposes a small JSON probe at a configurable path.
//
// Used by load balancers, Kubernetes liveness/readiness probes, and uptime
// monitors. Default path is /healthz, chosen because that's the convention
// across major orchestrators (k8s, Cloud Run, AWS ALBs).
//
// Default response body:
//   { status: "ok", tools: <count>, uptime: <seconds>, version: "x.y.z" }
//
// Custom response shape via the `body` option. Custom path via `path`.
// Always returns 200 unless the user's body callback throws.

import type { Middleware } from "../middleware.js";
import type { ToolkitServer } from "../mcp-server.js";

export interface HealthCheckOptions {
  // Path to match. Default "/healthz". Matches exact path; query strings
  // are ignored.
  path?: string;
  // Override the response body. Receives the toolkit server, returns any
  // JSON serialisable value.
  body?: (server: ToolkitServer) => unknown | Promise<unknown>;
}

export function healthCheck(opts: HealthCheckOptions = {}): Middleware {
  const path = opts.path ?? "/healthz";

  let serverRef: ToolkitServer | null = null;

  return {
    name: "healthCheck",
    setup(server) {
      serverRef = server;
    },
    async before({ req, res }) {
      if (!serverRef) return;

      const reqPath = (req.url ?? "").split("?")[0];
      if (reqPath !== path) return;

      // Only respond to GET. Other methods fall through to MCP transport.
      if ((req.method ?? "GET").toUpperCase() !== "GET") return;

      const body = opts.body
        ? await opts.body(serverRef)
        : defaultBody(serverRef);

      const json = JSON.stringify(body);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("content-length", Buffer.byteLength(json).toString());
      res.end(json);

      return { handled: true };
    },
  };
}

function defaultBody(server: ToolkitServer): {
  status: "ok";
  tools: number;
  uptime: number;
  version: string;
} {
  const startedAt = server.startedAt;
  const uptime = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  return {
    status: "ok",
    tools: server.toolNames.length,
    uptime,
    version: server.info.version,
  };
}
