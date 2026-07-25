import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /** Match repo-wide server tests (see root vitest.config.ts). */
    pool: "forks",
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
