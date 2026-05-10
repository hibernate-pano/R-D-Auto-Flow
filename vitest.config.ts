import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@rdaf/domain": path.resolve(__dirname, "packages/domain/src/index.ts"),
      "@rdaf/config-contract": path.resolve(__dirname, "packages/config-contract/src/index.ts"),
    },
  },
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
