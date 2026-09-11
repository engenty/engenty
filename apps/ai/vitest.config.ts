import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@engenty/ai-skills": path.resolve(
        import.meta.dirname,
        "../../packages/ai-skills/src/index.ts"
      ),
      "@engenty/search-index": path.resolve(
        import.meta.dirname,
        "../../packages/search-index/src/index.ts"
      ),
    },
  },
  test: {
    /** Match repo-wide server tests (see root vitest.config.ts). */
    pool: "forks",
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // The first test in each fork pays a one-time cold-start cost: transforming +
    // importing the heavy Mastra module graph (warm ~1.6s, but transform-bound and
    // able to balloon well past the 5s vitest default on a loaded CI runner). The
    // import happens lazily inside the test body (await createApp() / await
    // import(...)), so the per-test clock covers it — give generous headroom over
    // the root config's 10s so cold starts don't surface as "Test timed out" flakes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Offline unit tests: prod defaults to remote; tests opt into local mirrors.
    env: {
      ENGENTY_WORKSPACE_FS: "local",
    },
  },
});
