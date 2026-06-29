import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /** Match repo-wide server tests (see root vitest.config.ts). */
    pool: "forks",
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Offline unit tests: prod defaults to remote; tests opt into local mirrors.
    env: {
      ENGENTY_WORKSPACE_FS: "local",
    },
  },
});
