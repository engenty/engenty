import path from "node:path";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const src = path.resolve(import.meta.dirname, "src");

// Manage runs its own vitest project so the `@/` alias resolves. Root vitest
// covers core/packages/modules; this covers apps/manage only.
export default defineConfig({
  resolve: {
    alias: {
      "@": src,
      "@engenty/api-client": path.resolve(
        repoRoot,
        "packages/api-client/src/index.ts"
      ),
      "@engenty/environment": path.resolve(
        repoRoot,
        "packages/environment/src/index.ts"
      ),
    },
  },
  test: {
    root: import.meta.dirname,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: [
      path.join(repoRoot, "test/setup.ts"),
      path.join(import.meta.dirname, "vitest.setup.ts"),
    ],
    testTimeout: 10_000,
  },
});
