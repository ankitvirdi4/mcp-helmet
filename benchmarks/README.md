# Benchmarks

Microbenchmarks for the per-request overhead of each middleware. Numbers
in the main `README.md` come from this script.

## Run

```bash
npm run bench
```

Tunables (env vars):

| Var | Default | Meaning |
|---|---|---|
| `BENCH_REQUESTS` | 2000 | Timed requests per scenario per run |
| `BENCH_WARMUP` | 500 | Untimed warmup requests per scenario per run |
| `BENCH_RUNS` | 3 | Full passes; reported numbers are the median |

## Scenarios

1. `bare` — no middleware. Baseline.
2. `+requestLog` — `requestLog({ logger: () => {} })`. Logger discards
   so we measure the wrap path, not stderr IO.
3. `+bearerAuth` — `bearerAuth({ verify: () => ({ user, scopes }) })`.
   Verify is a synchronous noop so we measure middleware + AsyncLocalStorage,
   not crypto.
4. `+rateLimiter` — `rateLimiter` with a max well above the test count.
   Measures the path through the limiter, not the rejection path.
5. `full stack` — all four together. `gracefulShutdown` is intentionally
   excluded because it has no `before` hook (zero per-request overhead).

## Interpretation

The numbers are **relative** and useful for two things:

- **Catching regressions.** If a future change pushes `full stack /
  bare > 5x`, the script exits non-zero. That guards against
  accidental algorithmic blowups.
- **Sizing the per-middleware overhead** so users can budget
  realistically.

What the numbers are NOT:

- A substitute for load testing against your real production stack.
- Predictive of behavior under concurrency. This bench is sequential.
- Stable across machines or even consecutive runs on the same machine.
  Variance of 5-15% across runs is normal.

## Why pre-warm

The script runs every scenario once before timing begins, discarding
the results. Without that, V8 JIT optimisations made while later
scenarios run bleed into the next pass, and the first measured
scenario (typically `bare`) looks artificially slow. The pre-warm
makes the numbers comparable across scenarios.

## Why a fresh server per scenario

Each scenario builds a new `createServer()`, registers its middleware,
and binds to port 0. This means every measurement starts from a clean
HTTP server with no cross-contamination from previous scenarios. The
cost is ~50ms of setup per scenario per run, paid before the timed
loop starts.
