// Transport selection. Reads MCP_TRANSPORT and PORT/HOST env vars by default.
// Explicit options override the env.

import type { StartOptions, Transport } from "./types.js";

export interface ResolvedTransport {
  transport: Transport;
  port: number;
  host: string;
}

export function resolveTransport(opts: StartOptions = {}): ResolvedTransport {
  const fromEnv = readEnv();
  const transport = opts.transport ?? fromEnv.transport ?? "stdio";
  const port = opts.port ?? fromEnv.port ?? 3000;
  const host = opts.host ?? fromEnv.host ?? "0.0.0.0";

  if (transport !== "stdio" && transport !== "http") {
    throw new Error(
      `mcp-helmet: unknown transport "${transport}". Expected "stdio" or "http".`,
    );
  }

  return { transport, port, host };
}

interface PartialEnvTransport {
  transport?: Transport;
  port?: number;
  host?: string;
}

function readEnv(): PartialEnvTransport {
  const env = readProcessEnv();
  const result: PartialEnvTransport = {};

  const t = env.MCP_TRANSPORT?.toLowerCase();
  if (t === "stdio" || t === "http") result.transport = t;

  if (env.PORT) {
    const p = Number.parseInt(env.PORT, 10);
    if (Number.isFinite(p) && p > 0) result.port = p;
  }

  if (env.HOST) result.host = env.HOST;

  return result;
}

function readProcessEnv(): Record<string, string | undefined> {
  if (typeof process !== "undefined" && process.env) {
    return process.env;
  }
  return {};
}
