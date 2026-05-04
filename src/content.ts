// Auto content wrapping. Tool handlers can return:
//   - string                 -> wrapped in TextContent
//   - object (Record)        -> JSON-serialised TextContent
//   - Content[] array        -> passed through unchanged
//   - undefined / null       -> wrapped in empty TextContent
//
// The MCP SDK expects tools to return { content: ContentItem[], isError?: boolean }.
// This module produces the content array; the wrapper in mcp-server.ts assembles the
// final shape.

import type { ContentItem, ToolReturn } from "./types.js";

export function wrapToolReturn(result: ToolReturn | null | undefined): ContentItem[] {
  if (result === null || result === undefined) {
    return [{ type: "text", text: "" }];
  }

  if (typeof result === "string") {
    return [{ type: "text", text: result }];
  }

  if (Array.isArray(result)) {
    if (isContentArray(result)) {
      return result;
    }
    return [{ type: "text", text: jsonStringify(result) }];
  }

  if (typeof result === "object") {
    return [{ type: "text", text: jsonStringify(result) }];
  }

  // Numbers, booleans, etc.
  return [{ type: "text", text: String(result) }];
}

function isContentArray(value: unknown[]): value is ContentItem[] {
  return value.every(
    (v): v is ContentItem =>
      typeof v === "object" &&
      v !== null &&
      "type" in v &&
      typeof (v as { type: unknown }).type === "string",
  );
}

function jsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return `[unstringifiable value: ${(err as Error).message}]`;
  }
}
