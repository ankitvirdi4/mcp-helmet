// Public types for mcp-helmet.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// A handler return value can be a string, an object, or a Content array.
// Strings are wrapped in TextContent. Objects are JSON serialised into
// TextContent. Arrays of Content are passed through unchanged.
export type ToolReturn = string | Record<string, unknown> | unknown[] | ContentItem[];

export interface TextContentItem {
  type: "text";
  text: string;
}

export interface ImageContentItem {
  type: "image";
  data: string;
  mimeType: string;
}

export type ContentItem = TextContentItem | ImageContentItem | { type: string; [key: string]: unknown };

export interface CreateServerOptions {
  name: string;
  version: string;
  // Forwarded to McpServer's serverInfo.title if provided.
  title?: string;
  // Optional capabilities override. By default the SDK infers from registered tools.
  capabilities?: Record<string, unknown>;
}

export type Transport = "stdio" | "http";

export interface StartOptions {
  // Override the env-based transport selection.
  transport?: Transport;
  // For HTTP transport, the port to listen on. Default 3000.
  port?: number;
  // For HTTP transport, the host to bind. Default "0.0.0.0".
  host?: string;
}

// Re-exported for convenience: users often need McpServer's type.
export type UnderlyingMcpServer = McpServer;
