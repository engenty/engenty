import { defineConfig } from "vitest/config";

// End-to-end suite: requires the local Supabase stack (127.0.0.1:54321) with
// the retrieval_core migration applied. Run via `pnpm --filter
// @engenty/retrieval test:e2e`.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 30_000,
  },
});
