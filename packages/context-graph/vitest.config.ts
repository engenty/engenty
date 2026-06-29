import path from "node:path";
import { defineConfig } from "vitest/config";

const here = import.meta.dirname;
const repoRoot = path.resolve(here, "../..");

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    setupFiles: [path.join(here, "__tests__/setup-env.ts")],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@engenty/plugin-sdk": path.resolve(
        repoRoot,
        "packages/plugin-sdk/src/index.ts"
      ),
      "@engenty/telemetry": path.resolve(
        repoRoot,
        "packages/telemetry/src/index.ts"
      ),
    },
  },
});
