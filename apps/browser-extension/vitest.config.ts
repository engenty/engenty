import { defineConfig } from "vitest/config";

// Scope vitest to this package; the repo-root vitest.config.ts otherwise
// resolves upward and runs the whole workspace.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
