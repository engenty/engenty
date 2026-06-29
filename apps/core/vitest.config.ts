import path from "node:path";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  root: repoRoot,
  test: {
    pool: "forks",
    include: ["apps/core/src/**/*.test.ts", "apps/core/src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
    setupFiles: [
      path.join(import.meta.dirname, "test/vitest-setup-root-chdir.ts"),
      path.join(repoRoot, "test/setup.ts"),
    ],
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@engenty/plugin-sdk": path.resolve(
        repoRoot,
        "packages/plugin-sdk/src/index.ts"
      ),
      "@engenty/pdf-service": path.resolve(
        repoRoot,
        "packages/pdf-service/src/index.ts"
      ),
      "@engenty/ai-core/browser": path.resolve(
        repoRoot,
        "packages/ai-core/src/browser.ts"
      ),
      "@engenty/ai-core": path.resolve(
        repoRoot,
        "packages/ai-core/src/index.ts"
      ),
    },
  },
});
