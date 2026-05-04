import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  detectZodVersion,
  inputShapeToJsonSchema,
  zodToJsonSchema,
} from "./zod-compat.js";

// Note: zod >=3.25 ships v4 under the `zod/v4` subpath. We test both detection
// paths. The integration spike at zod-compat-spike-test.js exercises a real v4
// schema via a require-resolution hack; here we test the public detection logic
// via crafted shapes plus the real v3 path through the installed zod package.

describe("detectZodVersion", () => {
  it("detects v3 schemas via _def.typeName", () => {
    expect(detectZodVersion(z.string())).toBe("v3");
    expect(detectZodVersion(z.object({ a: z.string() }))).toBe("v3");
  });

  it("detects v4 shapes via _zod.def", () => {
    expect(detectZodVersion({ _zod: { def: { type: "string" } } })).toBe("v4");
  });

  it("returns unknown for non Zod values", () => {
    expect(detectZodVersion(null)).toBe("unknown");
    expect(detectZodVersion(undefined)).toBe("unknown");
    expect(detectZodVersion({})).toBe("unknown");
    expect(detectZodVersion("hello")).toBe("unknown");
    expect(detectZodVersion(42)).toBe("unknown");
  });

  it("does not confuse a plain object with _def fields", () => {
    expect(detectZodVersion({ _def: {} })).toBe("unknown");
    expect(detectZodVersion({ _def: { typeName: 7 } })).toBe("unknown");
  });
});

describe("zodToJsonSchema (v3 path)", () => {
  it("converts a v3 object schema to JSON Schema", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    });
    const result = zodToJsonSchema(schema);
    expect(result.type).toBe("object");
    const properties = result.properties as Record<string, { type: string }>;
    expect(properties.name.type).toBe("string");
    expect(properties.age.type).toBe("number");
    expect(result.required).toEqual(["name"]);
  });

  it("strips $schema and definitions from v3 output", () => {
    const schema = z.object({ a: z.string() });
    const result = zodToJsonSchema(schema);
    expect("$schema" in result).toBe(false);
    expect("definitions" in result).toBe(false);
  });

  it("handles enums and arrays", () => {
    const schema = z.object({
      tags: z.array(z.string()),
      status: z.enum(["active", "inactive"]),
    });
    const result = zodToJsonSchema(schema);
    const properties = result.properties as Record<
      string,
      { type?: string; enum?: string[] }
    >;
    expect(properties.tags.type).toBe("array");
    expect(properties.status.enum).toEqual(["active", "inactive"]);
  });
});

describe("inputShapeToJsonSchema", () => {
  it("accepts a Zod object schema directly", () => {
    const schema = z.object({ q: z.string() });
    const result = inputShapeToJsonSchema(schema);
    expect(result.type).toBe("object");
  });

  it("accepts a raw shape record and wraps it via z.object", () => {
    const result = inputShapeToJsonSchema({ q: z.string(), n: z.number() });
    expect(result.type).toBe("object");
    const properties = result.properties as Record<string, { type: string }>;
    expect(properties.q.type).toBe("string");
    expect(properties.n.type).toBe("number");
  });

  it("rejects non object input", () => {
    expect(() => inputShapeToJsonSchema(null)).toThrow(/must be a Zod schema/);
    expect(() => inputShapeToJsonSchema(42 as unknown)).toThrow(
      /must be a Zod schema/,
    );
  });
});

describe("zodToJsonSchema error paths", () => {
  it("throws a clear error for unknown input", () => {
    expect(() => zodToJsonSchema({})).toThrow(/could not detect Zod version/i);
  });
});
