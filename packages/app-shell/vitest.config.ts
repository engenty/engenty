import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
    setupFiles: [path.resolve(import.meta.dirname, "../../test/setup.ts")],
    pool: "forks",
  },
});
