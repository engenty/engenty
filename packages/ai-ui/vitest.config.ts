import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@engenty/search-index": path.resolve(
        import.meta.dirname,
        "../search-index/src/index.ts"
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
    setupFiles: [
      path.resolve(import.meta.dirname, "../../test/setup.ts"),
      path.resolve(import.meta.dirname, "vitest.setup.ts"),
    ],
  },
});
