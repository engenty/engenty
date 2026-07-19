import path from "node:path";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(import.meta.dirname);

// Real-database integration lane: `*.integration.test.ts` (plus the
// grandfathered retrieval `*.e2e.test.ts`) against the local Supabase stack.
// Run via `pnpm test:integration`; excluded from the unit run. Suites seed
// their own tenants through @engenty/test-kit/integration and clean up via
// the tenant cascade. CI: .github/workflows/integration.yml (main + nightly).
export default defineConfig({
  root: repoRoot,
  test: {
    include: [
      "apps/**/*.integration.test.ts",
      "packages/**/*.integration.test.ts",
      "modules/**/*.integration.test.ts",
      "apps/**/*.e2e.test.ts",
      "packages/**/*.e2e.test.ts",
      "modules/**/*.e2e.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
    // One shared database — run test files sequentially so suites do not
    // interleave writes.
    fileParallelism: false,
    pool: "forks",
    setupFiles: [path.join(repoRoot, "test/integration-setup.ts")],
    testTimeout: 30_000,
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
      "@engenty/test-kit/integration": path.resolve(
        repoRoot,
        "packages/test-kit/src/dal/integration-db.ts"
      ),
      "@engenty/test-kit": path.resolve(
        repoRoot,
        "packages/test-kit/src/index.ts"
      ),
    },
  },
});
