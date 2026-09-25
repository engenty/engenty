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

## Remote cache

**Deployed** — `TURBO_API`, `TURBO_TEAM` and `TURBO_TOKEN` are configured on the
repo, so turbo uses a **remote cache** (shared across branches, runs, and — if
developers set the same env locally — machines). The `actions/cache` fallback
above still runs alongside it and covers what the remote cache misses.

> **Upload timeout — the failure mode to watch.** turbo's default is 60s, and
> the largest module artifacts (a `dist/` with bundled `.d.ts`) do not finish in
> that. A timed-out upload is only a **warning** —
> `the cache artifact for <hash> was too large to upload within the timeout` —
> so the build goes green while the artifact is never written, and every later
> run misses that task again. It stays invisible until something else fails.
> Both workflows therefore set `TURBO_REMOTE_CACHE_UPLOAD_TIMEOUT: "300"`.
> If a job is mysteriously slow, grep its log for `too large to upload` before
> anything else.

If it ever needs re-provisioning:

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

## Database guards

Two checks assert database-level invariants that the unit suite structurally
cannot see — the auth stores fall back to an in-memory implementation, so no
test ever asks Postgres whether a grant or a policy exists. Both query the local
Supabase container and **soft-skip** when it is not running (CI has no migrated
DB today, so they are no-ops there until one is added); pass `--require-db` to
turn a skip into a failure.

| Command | Invariant |
| --- | --- |
| `pnpm check:rls-coverage` | Every table with a `tenant_id` column has row-level security enabled. Service-role-only tables need no policies — RLS-on with zero policies is deny-all. |
| `pnpm check:grants-coverage` | Every table in `core` and `module_*` is reachable by `service_role` (select/insert/update/delete). |

Each has an allowlist for deliberate exceptions
(`scripts/rls-coverage-allowlist.json`, `scripts/grants-coverage-allowlist.json`)
and every entry must carry a justification. Grant exceptions declare *which*
verbs are withheld, so an append-only table still fails the check if it loses an
unrelated grant.

The grants guard exists because `grant ... on all tables in schema x` is
expanded once, against the tables that exist at that instant. A table created
later in the same migration silently gets nothing — which is how four `core`
tables (`device_authorizations`, `sessions`, `api_tokens`, `service_credential`)
shipped unwritable and only surfaced when device login was first run against a
deployment. When adding a schema, write both halves:

```sql
grant select, insert, update, delete on all tables in schema x to service_role;
alter default privileges in schema x
  grant select, insert, update, delete on tables to service_role;
```

The second line is the one that keeps future tables covered. Note that
`service_role` bypasses RLS, so the table grant is the only database-side gate
on the server lane: a missing grant does not restrict a table, it makes it
unreachable.

## Skipped paths

Pushes touching only root-level markdown (plans, `AGENTS.md`, `README.md`,
`CHANGELOG.md`) or `.claude/**` skip CI entirely. `docs/**` markdown is
**not** skipped — it feeds the docs app build.

## Browser smoke

`.github/workflows/smoke.yml` is a separate nightly / `workflow_dispatch` lane
(`pnpm test:smoke`). It drives the real UI through Playwright and **fails on
gross interaction regression**:

| Gate | Today (CI floor) | Product budget |
|---|---|---|
| Warm interaction response p95 | < 2000ms | < 100ms |
| Any navigation | < 4500ms | never wait for React’s 5s transition expiration |
| Cached paint p95 | < 3000ms | < 200ms |

Timings are written to `e2e/.results/interaction-timings.json` and uploaded as
the `interaction-timings` artifact. Tighten the CI floor toward the product
budget after a baseline exists.

`e2e/smoke/interaction.smoke.spec.ts` is required on **react / react-dom /
react-router-dom** upgrades — the app opts `BrowserRouter` out of
`startTransition` (`useTransitions={false}` in `apps/ui/src/main.tsx`) while
`useSyncExternalStore` is in the tree.

Production-build timings (UI dist served by the prod gateway) are not part of
this job. The stub is `.github/workflows/interaction-prod.yml` /
`pnpm test:smoke:prod` (`scripts/e2e-prod-preview.mjs`).
