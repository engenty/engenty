import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
    setupFiles: [path.resolve(import.meta.dirname, "../../test/setup.ts")],
    testTimeout: 10_000,
  },
});
