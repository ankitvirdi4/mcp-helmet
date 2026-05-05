import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    external: ["@modelcontextprotocol/sdk", "zod", "zod-to-json-schema"],
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: false,
    clean: false,
    target: "es2022",
    banner: { js: "#!/usr/bin/env node" },
    external: ["@modelcontextprotocol/sdk", "zod", "zod-to-json-schema"],
  },
]);
