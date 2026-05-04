import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveTransport } from "./transport.js";

describe("resolveTransport", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MCP_TRANSPORT;
    delete process.env.PORT;
    delete process.env.HOST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to stdio when no env or opts are set", () => {
    expect(resolveTransport()).toEqual({
      transport: "stdio",
      port: 3000,
      host: "0.0.0.0",
    });
  });

  it("reads MCP_TRANSPORT=http from env", () => {
    process.env.MCP_TRANSPORT = "http";
    expect(resolveTransport().transport).toBe("http");
  });

  it("is case insensitive on MCP_TRANSPORT", () => {
    process.env.MCP_TRANSPORT = "HTTP";
    expect(resolveTransport().transport).toBe("http");
  });

  it("reads PORT and HOST from env", () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.PORT = "8080";
    process.env.HOST = "127.0.0.1";
    expect(resolveTransport()).toEqual({
      transport: "http",
      port: 8080,
      host: "127.0.0.1",
    });
  });

  it("ignores invalid PORT values", () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.PORT = "not-a-number";
    expect(resolveTransport().port).toBe(3000);
  });

  it("ignores PORT=0 and negative ports", () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.PORT = "0";
    expect(resolveTransport().port).toBe(3000);
    process.env.PORT = "-5";
    expect(resolveTransport().port).toBe(3000);
  });

  it("explicit opts override env", () => {
    process.env.MCP_TRANSPORT = "stdio";
    process.env.PORT = "8080";
    expect(
      resolveTransport({ transport: "http", port: 9090, host: "localhost" }),
    ).toEqual({
      transport: "http",
      port: 9090,
      host: "localhost",
    });
  });

  it("ignores unknown MCP_TRANSPORT values from env (falls back to default)", () => {
    process.env.MCP_TRANSPORT = "rabbitmq";
    expect(resolveTransport().transport).toBe("stdio");
  });

  it("throws when explicit transport opt is invalid", () => {
    expect(() =>
      resolveTransport({ transport: "smtp" as unknown as "http" }),
    ).toThrow(/unknown transport/i);
  });
});
