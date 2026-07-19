---
title: CI pipeline
description: How the verify pipeline stays fast as the repo grows — per-package tests, turbo caching, and the optional remote cache.
---

# CI pipeline

CI is a single `verify` job (`.github/workflows/ci.yml`) that runs on every
push and PR to `main`: install → generated artifacts → config checks → build →
typecheck → lint (changed files) → test. Deploys are **not** part of CI — only
a `v*` tag builds and deploys images.

The pipeline is built around one idea: **every expensive step goes through
turbo, so unchanged packages are cache hits**. A change to one module rebuilds
and retests that module and its dependents; the rest of the workspace is
restored from cache.

## Per-package tests

`pnpm test` runs `turbo run test test:scripts`:

- Every workspace package with tests declares a `test` script that runs
  **only its own suite**. Packages without a local `vitest.config.ts` use the
  repo-root config, scoped by path filter:

  ```json
  "test": "vitest run --root ../.. modules/team/"
  ```

  The trailing slash matters — vitest CLI filters are substring matches, so
  `modules/team` would also collect `modules/team-chat`.
- `test:scripts` is a root-level turbo task (`//#test:scripts`) covering
  `scripts/**` tests.
- `scripts/check-test-wiring.mjs` (CI: "Test wiring check") fails the build
  when a package has tests but no `test` script (turbo would silently skip
  it), or a bare unscoped `vitest run` (which would re-run the whole
  workspace inside one package's task).

Full-workspace runs are still available: `pnpm test:all` (single vitest
process over everything, useful for debugging cross-package interference) and
`pnpm test:watch`.

## Caching

- Turbo's task cache is persisted across CI runs via `actions/cache` on
  `.turbo/cache`, keyed by SHA with a prefix fallback (newest cache wins).
  The save happens right after Build so a dying runner doesn't lose the seed.
- The `test` task hashes package inputs **plus** the shared root test files
  (`vitest.config.ts`, `test/setup.ts`, the root-chdir setup) and the
  Supabase env vars, so cache hits are only served when none of them changed.
- Supabase env defaults for tests come from `test/setup.ts` — CI sets nothing.

## Optional remote cache

When the repo has a `TURBO_API` variable and `TURBO_TOKEN` secret configured,
CI switches turbo to a **remote cache** (shared across branches, runs, and —
if developers set the same env locally — machines). Until then the
`actions/cache` fallback above is used.

To enable it:

1. Deploy a [turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache)
   instance (a single small container; S3/storage-backed) — e.g. as a Coolify
   service next to the app.
2. Set repo config (`-R engenty/engenty-pro` — mind the repo, vars on the
   wrong repo have bitten us before):
   ```bash
   gh variable set TURBO_API -R engenty/engenty-pro --body "https://cache.example.com"
   gh variable set TURBO_TEAM -R engenty/engenty-pro --body "team_engenty"
   gh secret set TURBO_TOKEN -R engenty/engenty-pro
   ```
3. Optionally export the same three variables locally (`.zshrc`) so local
   builds seed the cache CI reads.

## Skipped paths

Pushes touching only root-level markdown (plans, `AGENTS.md`, `README.md`,
`CHANGELOG.md`) or `.claude/**` skip CI entirely. `docs/**` markdown is
**not** skipped — it feeds the docs app build.
