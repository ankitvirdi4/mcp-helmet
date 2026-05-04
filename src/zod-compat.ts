// Zod v3 / v4 compatibility shim.
//
// Detects which Zod version produced a schema and converts it to JSON Schema
// using the appropriate method. The toolkit passes raw JSON Schema to the
// SDK's tool registration, bypassing the SDK's own Zod conversion.
//
// Detection:
//   v4 (and >=3.25 via zod/v4 subpath): schema._zod.def exists
//   v3 (3.22 through 3.24):             schema._def.typeName exists, no ._zod
//
// Ported from the validation spike at zod-compat-spike.js (71 lines, 28/28 tests).

export type ZodVersion = "v3" | "v4" | "unknown";

interface ZodV4Like {
  _zod: { def: unknown };
}

interface ZodV3Like {
  _def: { typeName: string };
}

interface ZodLike {
  _zod?: { def: unknown };
  _def?: { typeName?: string };
}

interface ZodV4Module {
  toJSONSchema(schema: unknown): JsonSchema;
  object(shape: Record<string, unknown>): unknown;
}

interface ZodToJsonSchemaModule {
  zodToJsonSchema(schema: unknown, opts?: { target?: string }): JsonSchema & {
    $schema?: string;
    definitions?: Record<string, unknown>;
  };
}

// JSON Schema is intentionally typed loosely. We only need to drop a few
// keys (`$schema`, `definitions`) and return the rest as is for the SDK.
export type JsonSchema = Record<string, unknown>;

export function detectZodVersion(schema: unknown): ZodVersion {
  if (!schema || typeof schema !== "object") return "unknown";
  const s = schema as ZodLike;
  if (s._zod && typeof s._zod.def !== "undefined") return "v4";
  if (s._def && typeof s._def.typeName === "string") return "v3";
  return "unknown";
}

export function zodToJsonSchema(schema: unknown): JsonSchema {
  const version = detectZodVersion(schema);

  if (version === "v4") {
    const z4 = tryRequire<ZodV4Module>("zod/v4") ?? tryRequire<ZodV4Module>("zod");
    if (!z4 || typeof z4.toJSONSchema !== "function") {
      throw new Error(
        "mcp-toolkit: detected Zod v4 schema but toJSONSchema() not found. " +
          "Ensure 'zod' >=3.25 is installed.",
      );
    }
    const result = z4.toJSONSchema(schema);
    return stripJsonSchemaArtifacts(result);
  }

  if (version === "v3") {
    const lib = tryRequire<ZodToJsonSchemaModule>("zod-to-json-schema");
    if (!lib || typeof lib.zodToJsonSchema !== "function") {
      throw new Error(
        "mcp-toolkit: detected Zod v3 schema but 'zod-to-json-schema' is " +
          "not installed. Run: npm install zod-to-json-schema",
      );
    }
    const result = lib.zodToJsonSchema(schema, { target: "jsonSchema7" });
    return stripJsonSchemaArtifacts(result);
  }

  throw new Error(
    "mcp-toolkit: could not detect Zod version. Expected a Zod v3 " +
      "(._def.typeName) or v4 (._zod.def) schema.",
  );
}

// Accept either a full Zod object schema or a raw shape record like
// { name: z.string(), age: z.number() } and convert to JSON Schema.
export function inputShapeToJsonSchema(
  shape: Record<string, unknown> | unknown,
): JsonSchema {
  if (isZodSchema(shape)) {
    return zodToJsonSchema(shape);
  }
  if (!shape || typeof shape !== "object") {
    throw new Error(
      "mcp-toolkit: input shape must be a Zod schema or a record of Zod fields",
    );
  }
  // Detect the Zod version of the inner fields so we wrap with the matching
  // z.object(). Mixing v3 fields with v4's z.object() (or vice versa) produces
  // schemas the JSON Schema converter cannot read.
  const fieldVersion = inferShapeVersion(shape as Record<string, unknown>);

  let z: ZodV4Module | null;
  if (fieldVersion === "v3") {
    z = tryRequire<ZodV4Module>("zod");
  } else {
    z = tryRequire<ZodV4Module>("zod/v4") ?? tryRequire<ZodV4Module>("zod");
  }

  if (!z || typeof z.object !== "function") {
    throw new Error(
      "mcp-toolkit: could not resolve a Zod module matching the shape's field version",
    );
  }
  return zodToJsonSchema(z.object(shape as Record<string, unknown>));
}

function inferShapeVersion(shape: Record<string, unknown>): ZodVersion {
  for (const value of Object.values(shape)) {
    const v = detectZodVersion(value);
    if (v !== "unknown") return v;
  }
  return "unknown";
}

function isZodSchema(value: unknown): value is ZodV3Like | ZodV4Like {
  return detectZodVersion(value) !== "unknown";
}

function stripJsonSchemaArtifacts(s: JsonSchema): JsonSchema {
  const { $schema, definitions, ...rest } = s as JsonSchema & {
    $schema?: unknown;
    definitions?: unknown;
  };
  void $schema;
  void definitions;
  return rest;
}

// require() shim that works in both ESM and CJS builds. We need a true
// runtime require so tryRequire() can swallow MODULE_NOT_FOUND for optional
// peers without crashing the import.
function tryRequire<T>(id: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = createRequire(import.meta.url ?? "file:///");
    return req(id) as T;
  } catch {
    return null;
  }
}

import { createRequire } from "node:module";
