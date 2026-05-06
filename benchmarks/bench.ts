// Benchmark harness for mcp-helmet's middleware overhead.
//
// Drives a real listening HTTP server on localhost with the SDK's
// StreamableHTTPClientTransport doing N sequential `tools/call`
// requests. Reports p50 / p95 / p99 / mean latency in ms plus
// throughput in req/s for each scenario.
//
// Run from the repo root:
//
//   npx tsx benchmarks/bench.ts
//
// Optional env:
//
//   BENCH_REQUESTS=1000   # requests per scenario after warmup (default 2000)
//   BENCH_WARMUP=200      # warmup requests, untimed (default 200)
//   BENCH_RUNS=3          # number of full passes (default 3, reports median)
//
// Caveats:
// - Single-process, single-host. These are *relative* numbers, useful
//   for catching regressions and sizing the per-request overhead of
//   each middleware. They are NOT a substitute for load testing
//   against your real production stack.
// - Numbers vary 5-15% across runs depending on the rest of your
//   machine. Run with nothing else hot for tighter numbers.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import {
  bearerAuth,
  createServer,
  healthCheck,
  rateLimiter,
  requestLog,
  type ToolkitServer,
} from "../src/index.js";

const REQUESTS = Number(process.env.BENCH_REQUESTS ?? 2000);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 500);
const RUNS = Number(process.env.BENCH_RUNS ?? 3);

interface Scenario {
  name: string;
  setup: (server: ToolkitServer) => void;
  headers?: Record<string, string>;
}

const VERIFY_NOOP = async () => ({ user: "u", scopes: [] as string[] });

const SCENARIOS: Scenario[] = [
  {
    name: "bare",
    setup: () => {
      // No middleware. Baseline.
    },
  },
  {
    name: "+requestLog",
    setup: (server) => {
      // Logger discards entries so we measure the wrap path, not stderr IO.
      server.use(requestLog({ logger: () => {} }));
    },
  },
  {
    name: "+bearerAuth",
    setup: (server) => {
      server.use(bearerAuth({ verify: VERIFY_NOOP }));
    },
    headers: { Authorization: "Bearer noop" },
  },
  {
    name: "+rateLimiter",
    setup: (server) => {
      server.use(rateLimiter({ max: REQUESTS * 10, windowMs: 600_000 }));
    },
  },
  {
    // gracefulShutdown is intentionally NOT included here: it's a
    // setup-only middleware with no `before` hook, so it has zero
    // per-request overhead. Including it would not change the numbers.
    name: "full stack",
    setup: (server) => {
      server.use(healthCheck());
      server.use(requestLog({ logger: () => {} }));
      server.use(rateLimiter({ max: REQUESTS * 10, windowMs: 600_000 }));
      server.use(bearerAuth({ verify: VERIFY_NOOP }));
    },
    headers: { Authorization: "Bearer noop" },
  },
];

interface Stats {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  rps: number;
}

function summarise(samples: number[], elapsedMs: number): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const pct = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return {
    p50: pct(0.5),
    p95: pct(0.95),
    p99: pct(0.99),
    mean,
    rps: (samples.length / elapsedMs) * 1000,
  };
}

async function runScenario(scenario: Scenario): Promise<Stats> {
  const server = createServer({ name: "bench", version: "1.0.0" });
  scenario.setup(server);
  server.tool("noop", { x: z.number() }, async ({ x }: { x: number }) => `${x}`);

  const handle = await server.start({ transport: "http", port: 0, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${handle.port}`;

  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: scenario.headers ? { headers: scenario.headers } : undefined,
  });
  const client = new Client({ name: "bench-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  // Warmup. Untimed.
  for (let i = 0; i < WARMUP; i++) {
    await client.callTool({ name: "noop", arguments: { x: i } });
  }

  // Timed loop.
  const samples: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < REQUESTS; i++) {
    const start = performance.now();
    await client.callTool({ name: "noop", arguments: { x: i } });
    samples.push(performance.now() - start);
  }
  const elapsed = performance.now() - t0;

  await client.close();
  await handle.stop();

  return summarise(samples, elapsed);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function fmt(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

async function main(): Promise<void> {
  process.stderr.write(
    `# mcp-helmet benchmarks\n# requests/scenario: ${REQUESTS}, warmup: ${WARMUP}, runs: ${RUNS}\n# node ${process.version}, ${process.platform}/${process.arch}\n\n`,
  );

  // Global pre-warm: run every scenario once and discard. Without this,
  // V8 JIT optimisations made on later scenarios bleed into the timed
  // measurement and the first scenario looks artificially slow.
  process.stderr.write("  pre-warming JIT across all scenarios...\n");
  for (const scenario of SCENARIOS) {
    await runScenario(scenario);
  }

  const aggregated: Record<string, Stats> = {};

  for (const scenario of SCENARIOS) {
    const runs: Stats[] = [];
    for (let r = 0; r < RUNS; r++) {
      process.stderr.write(`  ${scenario.name} run ${r + 1}/${RUNS}...\n`);
      runs.push(await runScenario(scenario));
    }
    aggregated[scenario.name] = {
      p50: median(runs.map((r) => r.p50)),
      p95: median(runs.map((r) => r.p95)),
      p99: median(runs.map((r) => r.p99)),
      mean: median(runs.map((r) => r.mean)),
      rps: median(runs.map((r) => r.rps)),
    };
  }

  process.stdout.write(
    [
      "| Scenario | p50 (ms) | p95 (ms) | p99 (ms) | mean (ms) | req/s |",
      "|---|---|---|---|---|---|",
      ...SCENARIOS.map((s) => {
        const a = aggregated[s.name]!;
        return `| ${s.name} | ${fmt(a.p50)} | ${fmt(a.p95)} | ${fmt(a.p99)} | ${fmt(a.mean)} | ${fmt(a.rps)} |`;
      }),
      "",
    ].join("\n"),
  );

  // Sanity check: full stack should not be more than 5x the bare baseline.
  // If it is, there's a real perf bug we want to know about before shipping
  // 0.1.0 stable.
  const bare = aggregated["bare"]!;
  const full = aggregated["full stack"]!;
  const ratio = full.mean / bare.mean;
  process.stderr.write(`\n# full-stack mean / bare mean = ${ratio.toFixed(2)}x\n`);
  if (ratio > 5) {
    process.stderr.write(`# WARNING: full-stack overhead exceeds 5x baseline. Investigate before release.\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`bench failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
