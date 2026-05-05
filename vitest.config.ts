import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/types.ts",
        "src/middleware.ts",
        "src/index.ts",
      ],
    },
  },
});
