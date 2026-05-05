import { describe, expect, it } from "vitest";
import { getAuthContext, runWithAuthContext } from "./auth-context.js";

describe("auth-context", () => {
  it("returns undefined outside any scope", () => {
    expect(getAuthContext()).toBeUndefined();
  });

  it("makes the context visible inside the run callback", async () => {
    await runWithAuthContext({ user: "u1", scopes: ["read"] }, () => {
      const ctx = getAuthContext();
      expect(ctx?.user).toBe("u1");
      expect(ctx?.scopes).toEqual(["read"]);
    });
  });

  it("propagates through async chains", async () => {
    await runWithAuthContext({ user: "u1" }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(getAuthContext()?.user).toBe("u1");
      await Promise.resolve().then(() => {
        expect(getAuthContext()?.user).toBe("u1");
      });
    });
  });

  it("isolates scopes across sibling runs", async () => {
    const tasks = [
      runWithAuthContext({ user: "a" }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getAuthContext()?.user;
      }),
      runWithAuthContext({ user: "b" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getAuthContext()?.user;
      }),
    ];
    expect(await Promise.all(tasks)).toEqual(["a", "b"]);
    expect(getAuthContext()).toBeUndefined();
  });

  it("returns the value the callback resolves to", async () => {
    const value = await runWithAuthContext({ user: "u" }, () => 42);
    expect(value).toBe(42);

    const asyncValue = await runWithAuthContext({ user: "u" }, async () => "hi");
    expect(asyncValue).toBe("hi");
  });

  it("preserves arbitrary claim fields beyond user/scopes", async () => {
    await runWithAuthContext(
      { user: "u", scopes: ["s"], tenant: "acme", roles: ["admin"] },
      () => {
        const ctx = getAuthContext();
        expect(ctx?.tenant).toBe("acme");
        expect(ctx?.roles).toEqual(["admin"]);
      },
    );
  });
});
