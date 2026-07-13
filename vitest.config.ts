import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  plugins: [
    {
      name: "engenty-md-text",
      load(id) {
        if (id.endsWith(".md")) {
          const body = readFileSync(id, "utf8");
          return {
            code: `export default ${JSON.stringify(body)}`,
          };
        }
      },
    },
  ],
  root: repoRoot,
  test: {
    pool: "forks",
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "modules/**/*.test.ts",
      "modules/**/*.test.tsx",
      "scripts/**/*.test.ts",
    ],
    // apps/manage has its own vitest project (its `@/` alias + happy-dom setup);
    // run it via `pnpm --filter @engenty/manage test`.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.d.ts",
      "**/*.e2e.test.ts",
      "apps/manage/**",
    ],
    setupFiles: [
      path.join(repoRoot, "apps/core/test/vitest-setup-root-chdir.ts"),
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
