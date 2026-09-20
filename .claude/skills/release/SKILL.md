---
name: release
description: Steer development and releases in engenty-pro — pick the right work mode (directly on main / branch / worktree / worktree + dedicated DB) and ship a release the one correct way. Use when starting a change, deciding where to do the work, merging back to main, or cutting/pushing a release.
---

# Releasing & work modes (engenty-pro)

Everything ships from **`main`**. Pick a work mode, land the change on `main`, then cut a release. Deploys and the public mirror are automatic — but **only when you push a `v*` tag**.

## The one rule for shipping

```bash
pnpm release                        # interactive: bump + changelog + commit + annotated tag vX.Y.Z (LOCAL only)
git push origin main --follow-tags  # pushing the tag is what builds, deploys, and publishes
pnpm release:desktop                # builds the macOS .dmg locally + attaches it to the GitHub release
```

- `pnpm release` is the **single source of truth**. NEVER hand-edit `CHANGELOG.md`, `changelog.json`, the `package.json` version, or tags. (`pnpm release:changelog` drafts the changelog only.)
- Pushing the **`v*` tag** triggers `build-images.yml` (build → GHCR → Coolify deploy), `publish-open.yml` (sync the public `engenty/engenty` repo), `publish-packages.yml` (module packages) and `check-cli-package.yml` (stages the `engenty` npm package and dry-runs it as a leak check). The npm package itself is published **by the mirror**: the tag lands in `engenty/engenty` and its own `publish-cli.yml` publishes with Trusted Publishing + provenance.
- Pushing `main` **without a tag** runs CI only (lint / typecheck / test) — no build, no deploy.
- Commits use [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, …) — they drive the changelog groups and the suggested version bump.

Full reference: [`docs/content/dev/releases-and-versioning.md`](../../../docs/content/dev/releases-and-versioning.md).

## Step 1 — pick the work mode

| Mode | When | Isolation |
|------|------|-----------|
| **a) Directly on `main`** | Maintainer, trivial & low-risk (docs, config, tiny fix), **no schema change** | none |
| **b) Branch from `main`** | Normal feature; you want a PR / review; no need for a second running stack | git branch only |
| **c) Worktree** | Parallel or long-running work; keep the main checkout free; runs its own dev stack | separate dir + dev slot, **shared** local Supabase |
| **d) Worktree + dedicated DB** | **Schema-breaking migrations** or destructive data tests you don't want touching shared dev data | separate dir + dev slot + **own** Supabase |

Rule of thumb: escalate only as far as you need. Most work is **b**. Reach for **c** when you need `main`'s checkout untouched, and **d** only when migrations/data would corrupt the shared local DB.

Always work in **engenty-pro**, never engenty-framework.

## Step 2 — do the work in that mode

**a) Directly on main**
```bash
# edit → quality gate → commit → push (CI only)
pnpm check && pnpm typecheck && pnpm test   # pnpm fix to auto-format
git commit -am "fix: …"
git push origin main
```

**b) Branch from main (same checkout)**
```bash
git switch -c feat/x
pnpm dev                                     # normal dev loop
# land it:
git switch main && git merge --ff-only feat/x   # or: gh pr merge --squash <#>
git push origin main
```

**c) Worktree** (shares the local Supabase — same data)
```bash
git worktree add ../engenty-pro-x -b feat/x main
cd ../engenty-pro-x && pnpm install
pnpm engenty setup                         # REQUIRED once — config.toml + generated UI catalog are gitignored
pnpm dev:portless --domain=x                 # → https://x.engenty.localhost (own port slot)
# land it: merge feat/x back to main from any checkout, then push origin main
```
Starting the dev server **as Claude Code** (preview_start/launch.json, the
.localhost URL, common failure modes): see the [`dev-server` skill](../dev-server/SKILL.md).
Headless/Playwright: hit `http://localhost:<slot port>`, not the HTTPS URL. See [`docs/dev/portless-local-urls.md`](../../../docs/dev/portless-local-urls.md).

**d) Worktree + dedicated DB** (isolated Supabase — for schema-breaking / destructive work)
```bash
git worktree add ../engenty-pro-x -b feat/x main
cd ../engenty-pro-x && pnpm install
# Give this worktree its OWN Supabase so it can't touch shared dev data:
#   edit supabase/config.toml → set a unique project_id (e.g. "engenty-x")
#   and shift the [api]/[db]/[studio]/… ports off the shared 54321 range.
pnpm engenty setup                         # boots the isolated Supabase + migrations + .env.local
pnpm dev:portless --domain=x
# land it: merge to main; the migration travels with the code. Never point a
# worktree's dedicated DB migrations at the shared instance.
```

## Step 3 — land on main, then release

1. Get the change onto `main` (push directly for **a**, merge for **b/c/d**).
2. After any merge, run `pnpm lockfile:check` (catches a broken `pnpm-lock.yaml` before CI).
3. Sanity check `main` is green in CI and the app runs.
4. Ship it — the one rule at the top:
   ```bash
   pnpm release
   git push origin main --follow-tags
   ```
4. Watch the tag's `Build deploy images` run go green through the `deploy` job. That job pre-pulls the images, waits for Coolify to finish, then verifies the public endpoints — so a red `Verify public release` means the release really is not serving, not that the deploy was slow. The public repo updates in the same tag push.

## Guardrails (hard-won)

- **Deploys are release-gated**: only a `v*` tag builds + deploys. A plain `main` push never deploys.
- The deploy job is gated on repo variable **`COOLIFY_DEPLOY_ENABLED == 'true'`** — if deploys silently skip, check this flag first.
- The prebuilt compose uses `pull_policy: always`, so the VPS pulls the new `:latest` each deploy — don't remove it or releases stop going live.
- If a release is 503 afterwards, read the edge container's log on the VPS before suspecting migrations: it refuses to start when the server-lane preflight fails (e.g. Supabase restricted for an egress/spend cap) and then stays up-but-unhealthy without retrying, so it needs a `docker restart` once the cause is cleared.
- Public mirror auto-syncs on tag via `publish-open.yml` (needs the `PUBLIC_REPO_PUSH_TOKEN` secret). Don't hand-sync; if you must, `pnpm push:snapshot` (`DRY_RUN=1` to preview).
- Run `pnpm fix` before committing; CI lints changed files and will fail the push otherwise.
- After changing installed modules or SQL: `pnpm engenty generate && pnpm engenty db migrate`.
