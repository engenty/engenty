import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Tests should see source hooks, not a stale package dist.
      "@engenty/ui-plugin-sdk": path.resolve(
        import.meta.dirname,
        "../ui-plugin-sdk/src/index.ts"
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
    setupFiles: [path.resolve(import.meta.dirname, "../../test/setup.ts")],
    pool: "forks",
  },
});
