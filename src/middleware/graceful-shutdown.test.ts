import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createServer } from "../mcp-server.js";
import { gracefulShutdown } from "./graceful-shutdown.js";

// Build a fake process that records signal listeners and lets us emit at will.
function makeFakeProcess() {
  const emitter = new EventEmitter();
  const stderr = { writes: [] as string[], write(s: string) { this.writes.push(s); } };
  const exit = vi.fn((_code: number) => undefined);
  return {
    proc: {
      on: emitter.on.bind(emitter),
      off: emitter.off.bind(emitter),
      emit: emitter.emit.bind(emitter),
      stderr,
      exit,
    } as unknown as NodeJS.Process,
    emitter,
    stderr,
    exit,
  };
}

describe("gracefulShutdown middleware", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers handlers for SIGTERM and SIGINT by default", async () => {
    const { proc, emitter } = makeFakeProcess();
    const mw = gracefulShutdown({ process: proc, exit: () => {} });
    const server = createServer({ name: "test", version: "1.0.0" });

    await mw.setup!(server);

    expect(emitter.listenerCount("SIGTERM")).toBe(1);
    expect(emitter.listenerCount("SIGINT")).toBe(1);
  });

  it("respects a custom signal list", async () => {
    const { proc, emitter } = makeFakeProcess();
    const mw = gracefulShutdown({
      process: proc,
      signals: ["SIGTERM"],
      exit: () => {},
    });
    const server = createServer({ name: "test", version: "1.0.0" });

    await mw.setup!(server);

    expect(emitter.listenerCount("SIGTERM")).toBe(1);
    expect(emitter.listenerCount("SIGINT")).toBe(0);
  });

  it("removes its listeners when the cleanup callback runs", async () => {
    const { proc, emitter } = makeFakeProcess();
    const mw = gracefulShutdown({ process: proc, exit: () => {} });
    const server = createServer({ name: "test", version: "1.0.0" });

    const cleanup = (await mw.setup!(server)) as () => void;
    expect(emitter.listenerCount("SIGTERM")).toBe(1);

    cleanup();
    expect(emitter.listenerCount("SIGTERM")).toBe(0);
    expect(emitter.listenerCount("SIGINT")).toBe(0);
  });

  it("calls exit(0) after a successful shutdown on signal", async () => {
    const { proc, emitter, exit } = makeFakeProcess();
    const mw = gracefulShutdown({
      process: proc,
      timeoutMs: 1000,
      exit,
    });
    const server = createServer({ name: "test", version: "1.0.0" });
    await mw.setup!(server);

    emitter.emit("SIGTERM", "SIGTERM");
    // Wait a tick for the async shutdown chain to run.
    await new Promise((r) => setTimeout(r, 50));

    expect(exit).toHaveBeenCalledWith(0);
  });

  it("calls exit(1) and logs to stderr on shutdown failure", async () => {
    const { proc, emitter, exit, stderr } = makeFakeProcess();
    const mw = gracefulShutdown({
      process: proc,
      timeoutMs: 50,
      exit,
    });
    // Server's raw.close throws to simulate failure.
    const server = createServer({ name: "test", version: "1.0.0" });
    (server.raw as unknown as { close: () => Promise<void> }).close = async () => {
      throw new Error("close failed");
    };
    await mw.setup!(server);

    emitter.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 100));

    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr.writes.some((w) => w.includes("close failed"))).toBe(true);
  });

  it("ignores repeated signals during shutdown", async () => {
    const { proc, emitter, exit } = makeFakeProcess();
    const mw = gracefulShutdown({ process: proc, exit, timeoutMs: 1000 });
    const server = createServer({ name: "test", version: "1.0.0" });
    // Slow close to keep the shutdown in flight while we re-emit.
    (server.raw as unknown as { close: () => Promise<void> }).close = () =>
      new Promise((resolve) => setTimeout(resolve, 30));
    await mw.setup!(server);

    emitter.emit("SIGTERM", "SIGTERM");
    emitter.emit("SIGTERM", "SIGTERM");
    emitter.emit("SIGINT", "SIGINT");

    await new Promise((r) => setTimeout(r, 80));
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("times out and exits 1 if shutdown takes too long", async () => {
    const { proc, emitter, exit, stderr } = makeFakeProcess();
    const mw = gracefulShutdown({
      process: proc,
      timeoutMs: 25,
      exit,
    });
    const server = createServer({ name: "test", version: "1.0.0" });
    // Hang forever.
    (server.raw as unknown as { close: () => Promise<void> }).close = () =>
      new Promise(() => {
        /* never resolves */
      });
    await mw.setup!(server);

    emitter.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 100));

    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr.writes.some((w) => w.includes("timeout"))).toBe(true);
  });
});
