import { describe, expect, it } from "vitest";
import { wrapToolReturn } from "./content.js";

describe("wrapToolReturn", () => {
  it("wraps a plain string in TextContent", () => {
    expect(wrapToolReturn("hello")).toEqual([{ type: "text", text: "hello" }]);
  });

  it("wraps an object as JSON TextContent", () => {
    const result = wrapToolReturn({ name: "Alice", age: 30 });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    expect(JSON.parse((result[0] as { text: string }).text)).toEqual({
      name: "Alice",
      age: 30,
    });
  });

  it("passes through a Content[] array unchanged", () => {
    const content = [
      { type: "text" as const, text: "hi" },
      { type: "image" as const, data: "abc", mimeType: "image/png" },
    ];
    expect(wrapToolReturn(content)).toEqual(content);
  });

  it("wraps a non-Content array as JSON", () => {
    const result = wrapToolReturn([1, 2, 3]);
    expect(result).toHaveLength(1);
    expect((result[0] as { text: string }).text).toBe("[\n  1,\n  2,\n  3\n]");
  });

  it("wraps undefined as empty TextContent", () => {
    expect(wrapToolReturn(undefined)).toEqual([{ type: "text", text: "" }]);
  });

  it("wraps null as empty TextContent", () => {
    expect(wrapToolReturn(null)).toEqual([{ type: "text", text: "" }]);
  });

  it("stringifies primitives that are not strings", () => {
    expect(wrapToolReturn(42 as unknown as string)).toEqual([
      { type: "text", text: "42" },
    ]);
    expect(wrapToolReturn(true as unknown as string)).toEqual([
      { type: "text", text: "true" },
    ]);
  });

  it("handles unstringifiable objects gracefully", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = wrapToolReturn(circular);
    expect(result).toHaveLength(1);
    expect((result[0] as { text: string }).text).toMatch(/unstringifiable/);
  });

  it("recognises Content arrays only when every entry has a string type field", () => {
    const mixed = [{ type: "text", text: "hi" }, { foo: "bar" }];
    const result = wrapToolReturn(mixed);
    // Falls back to JSON serialisation since the second item lacks a `type` field.
    expect(result).toHaveLength(1);
    expect((result[0] as { text: string }).text).toContain("foo");
  });
});
