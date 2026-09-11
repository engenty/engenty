import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(import.meta.dirname);

// Node ≥22 web Storage is gated behind `--localstorage-file`; without it the
// undefined getter shadows happy-dom/jsdom Storage used by browser tests.
const localStorageFile = path.join(tmpdir(), "engenty-vitest-localstorage");

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
    execArgv: [`--localstorage-file=${localStorageFile}`],
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "modules/**/*.test.ts",
      "modules/**/*.test.tsx",
      "scripts/**/*.test.ts",
    ],
    // apps/manage and apps/ui have their own vitest projects, because `@/` is a
    // PER-APP alias — `apps/ui/src` in one, the app root in `apps/docs` — and a
    // single `@` here would silently resolve one app's imports into another.
    // Run them via `pnpm --filter @engenty/manage test` / `--filter @engenty/ui`;
    // `turbo run test` invokes both through their own `test` scripts, so
    // excluding them here removes nothing from CI.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.d.ts",
      "**/*.e2e.test.ts",
      "apps/manage/**",
      "apps/ui/**",
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
      "@engenty/ai-skills": path.resolve(
        repoRoot,
        "packages/ai-skills/src/index.ts"
      ),
      "@engenty/notifications": path.resolve(
        repoRoot,
        "packages/notifications/index.ts"
      ),
      "@engenty/search-index": path.resolve(
        repoRoot,
        "packages/search-index/src/index.ts"
      ),
    },
  },
});
