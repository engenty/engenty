import path from "node:path";
import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

/**
 * apps/ui runs its own vitest project so the `@/` alias resolves.
 *
 * `@` is a PER-APP convention, not a workspace one: it means `apps/ui/src`
 * here and the app root in `apps/docs`, and both live under the root runner's
 * `apps/**` include globs. Teaching the root config a single `@` would
 * therefore make the first docs test that imports one silently resolve into
 * this app — invisible in CI output, which is the failure class
 * `scripts/check-test-wiring.mjs` exists to catch. `apps/manage` has its own
 * project for the same reason.
 *
 * Without this, tests that import `@/components/spaces/…` did not merely fail
 * — they never LOADED (`Failed to resolve import "@/…"`), and vitest reports
 * that as "1 failed | 0 tests", which reads as noise rather than as a
 * component with a test file and no test coverage.
 *
 * EXTENDS the root config rather than restating it. Everything the suite
 * depends on that is not about `@` lives there and must not drift: the forks
 * pool and the `--localstorage-file` execArgv (Node ≥22 gates web Storage
 * behind it, and without it the undefined getter shadows happy-dom's Storage —
 * `use-space-section-open.test.ts` reads localStorage), the shared env setup,
 * the repo-root chdir, and the source aliases for `@engenty/ai-core*`,
 * `@engenty/plugin-sdk`, and `@engenty/search-index` that keep tests off a
 * possibly-stale `dist`.
 */
const merged = mergeConfig(
  rootConfig,
  defineConfig({
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    test: {
      root: import.meta.dirname,
    },
  })
);

/**
 * `include` and `exclude` are REPLACED, not merged.
 *
 * `mergeConfig` concatenates arrays, so the root's globs would ride along and
 * be re-anchored to this app — `apps/**`, `packages/**`, `modules/**`,
 * `scripts/**` and an `apps/ui/**` exclusion all resolved against `apps/ui/`.
 * That was already load-bearing, not hypothetical: `apps/ui/scripts/` exists,
 * and its one test was being collected purely because the root's
 * `scripts/**` glob happened to re-anchor onto it. Replacing the globs
 * silently dropped it (33 files → 32) until it was listed here on purpose —
 * which is the whole argument for spelling this out rather than inheriting it.
 */
merged.test = {
  ...merged.test,
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.d.ts",
    "**/*.e2e.test.ts",
  ],
  include: ["scripts/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
};

export default merged;
