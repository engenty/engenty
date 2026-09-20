---
title: Releases and versioning
description: How Engenty is versioned, how releases are cut, and what the version number means.
---

# Releases and versioning

## The version number

Engenty uses **Semantic Versioning** with pre-`1.0` alpha semantics:

- **`0.MINOR.PATCH`** — MAJOR stays `0` until we're ready to promise stability
  (`1.0` = GA).
- **MINOR** bumps for a **notable or breaking** change.
- **PATCH** bumps for fixes and small features.

Two things are deliberately kept separate:

| | What it answers | Where it lives |
|---|---|---|
| **Release version** | "Which release am I on?" | `package.json` `version`, git tag `v0.x.y`, `CHANGELOG.md` |
| **Build identity** | "Which exact build is running?" | git SHA + image tag (`ghcr.io/…:<sha>`) |

Don't encode a build counter or date into the release number — the SHA already
gives you exact build identity. A build surfaces as, e.g., `0.2.0 (a1b2c3d)`.

## Cutting a release

Cutting a release is **local and interactive** — one command bumps the version,
writes the changelog, commits, and tags. Nothing is pushed or built yet;
**pushing the tag** is the separate step that ships it (see [Shipping](#shipping-build--deploy)).

```bash
pnpm release               # full: changelog + bump package.json + commit + tag
pnpm release --changelog   # just draft/write the changelog, no bump/commit/tag
```

`pnpm release` (`scripts/release.mjs`) is an interactive stepper that:

1. Reads the Conventional Commits since the last tag via
   [git-cliff](https://git-cliff.org) and shows the **compact changelog** —
   `- Added: …`, `- Fixed: …`.
2. Asks **patch / minor / major** (it suggests one from the commit types; you
   choose). It shows the resulting `vX.Y.Z`.
3. Lets you **edit the entry** in `$EDITOR` before committing.
4. Writes `CHANGELOG.md` (compact) **and** `changelog.json` (structured — the
   source for docs/website generation), plus a slim
   `apps/ui/src/data/changelog.json` for the in-app About → Changelog dialog,
   then bumps `package.json`, commits `chore(release): vX.Y.Z`, and tags it.

Regenerate About data anytime with `pnpm about:data` (slim changelog + OSS
credits list from `pnpm licenses list`). Commit the outputs under
`apps/ui/src/data/`.

`pnpm release` itself never pushes, builds, or deploys — it only writes the
release commit and tag locally.

The format and grouping live in [`cliff.toml`](https://git-cliff.org/docs/configuration);
change the template there, not in the script.

## Shipping (build & deploy)

Deploys are **release-gated**: the image build + Coolify deploy run **only when a
`v*` tag is pushed**, never on a plain push to `main`. So shipping is one push:

```bash
git push origin main --follow-tags
```

`--follow-tags` sends the release commit **and** the annotated tag `pnpm release`
just made. That tag push triggers
[`.github/workflows/build-images.yml`](https://github.com/engenty/engenty-pro/blob/main/.github/workflows/build-images.yml):

1. Builds the seven deploy images — `edge`, `ai`, `migrate`, `docs`, `sandbox`,
   `browser` and `app-host` — on GitHub runners and pushes them to GHCR, tagged
   `:latest`, `:vX.Y.Z`, and `:<sha>`.
2. Triggers a Coolify redeploy over SSH, which pulls `:latest` and recreates the
   containers on the VPS.

These are the **pro** images, `ghcr.io/engenty/engenty-pro-<service>`, and they
are private. The same tag also publishes the open tree, a second and public set
of images, and the `engenty` npm package — all three from the mirror, see
[Pro / public](#pro--public).

Step 2 is worth knowing in detail, because two releases were mis-diagnosed over
it. The deploy job SSHes to the VPS with a forced-command key; what runs there is
[`deploy/scripts/coolify-queue-deploy.sh`](https://github.com/engenty/engenty-pro/blob/main/deploy/scripts/coolify-queue-deploy.sh)
installed as `/opt/coolify-deploy.sh` (**not** `deploy/scripts/coolify-deploy.sh`,
which is the blue/green orchestrator this app does not use). It pre-pulls the
release images while the old stack still serves, queues the deployment, and
blocks until Coolify reports it finished — only then does the job verify the
public endpoints. Pre-pull must name the **private** `engenty-pro-*` images the
prebuilt compose actually runs; when it named the public mirror images instead,
every deploy downloaded ~20 GB nothing would run and still pulled the real
images inside the outage window.

Every push to `main` (tagged or not) also runs `ci.yml` (lint, typecheck, test) —
that's the gate for code quality, independent of shipping.

**Manual rebuild/redeploy:** run the workflow via
`gh workflow run build-images.yml` (or the Actions tab → *Run workflow*) — e.g.
after a `deploy/**` compose-only change that has no new tag.

> Because builds only happen at release, a Docker-build break won't surface until
> you tag. CI still catches code/lint/test issues on every push; if you need to
> validate the image build before tagging, trigger a manual run first.

## Conventional Commits

The commit **type** drives the changelog group and the suggested bump:

| Type | Changelog group | Suggested bump (pre-1.0) |
|------|-----------------|--------------------------|
| `feat:` | Added | patch |
| `fix:` | Fixed | patch |
| `perf:` | Performance | patch |
| `refactor:` | Changed | patch |
| `deploy:` | Deploy | patch |
| `docs:` | Docs | patch |
| `chore:` / `ci:` / `test:` / `build:` / `style:` | (hidden) | — |
| any type + `!` or `BREAKING CHANGE:` footer | — | **minor** |

Example: `feat(inbox): add label filters` → `- Added [inbox]: …`, patch;
`feat(auth)!: drop legacy session cookie` → a **minor** bump.

### Scoped entries (module / area context)

Every commit must include a **Conventional Commit scope** — the part in
parentheses. Use the mainly affected module, package, or app:

```text
feat(tasks): plugin list columns and group-by project
fix(time-tracking): stabilize bootstrap and breadcrumb user picker
fix(ci): publish-open without checkout credential helper
```

`pnpm release` / `cliff.toml` turns that into changelog lines:

```markdown
- Added [tasks]: Plugin list columns and group-by project
- Fixed [time-tracking]: Stabilize bootstrap and breadcrumb user picker
- Fixed [ci]: Publish-open without checkout credential helper
```

Legacy commits without a scope (`feat: …`) remain supported by the release
tool and produce `- Added: …` with no brackets, but new commits must be scoped.

**Scope naming (convention):**

| Scope | Use for |
|-------|---------|
| Module id | `tasks`, `projects`, `contacts`, `time-tracking`, … — match `modules/<name>/` |
| App / package | `ui`, `settings`, `ai`, `ai-core`, `app-shell`, … |
| Repository-wide | `global` — only for genuinely cross-cutting changes |
| Infra | `ci`, `deploy`, `release` |

`chore`, `ci`, `test`, `build`, and `style` commits are omitted from the
changelog unless you use a type that maps to a group (e.g. `fix(ci): …`).

## Pro / public

The product version is **shared** across `engenty-pro` and the public
`engenty` repo — the same release is published to both. The public `CHANGELOG.md`
is the curated, user-facing log; closed-source changes (Manage, licensed fonts)
go in an internal addendum, but the **version string is one** so support and
debugging line up regardless of which repo someone is on.

**Publishing is automatic.** On every `v*` tag,
[`publish-open.yml`](https://github.com/engenty/engenty-pro/blob/main/.github/workflows/publish-open.yml)
snapshot-publishes the open subset of this repo to `engenty/engenty` — the same
tag push that builds and deploys. The public repo is a **filtered snapshot**, not
a commit-for-commit mirror: [`scripts/publish-open-snapshot.sh`](https://github.com/engenty/engenty-pro/blob/main/scripts/publish-open-snapshot.sh)
replaces its tree with `origin/main` minus the closed/pro-only paths (Manage,
banking, brand-assets, licensed fonts, the deploy workflow, …).

- Needs a repo secret **`PUBLIC_REPO_PUSH_TOKEN`** (a PAT with `Contents: write`
  on `engenty/engenty`).
- To publish manually (or reconcile after drift): `pnpm push:snapshot`
  (`DRY_RUN=1 pnpm push:snapshot` to preview).
- `scripts/publish-open.sh` (`pnpm push`) still exists for publishing a **single**
  open commit mid-development; the snapshot is the release-time / catch-up path.

### Public images

The snapshot pushes the release tag to the mirror as well, and that tag triggers
the mirror's **own** `publish-images.yml`: the same seven services, built from
the open tree, pushed as `ghcr.io/engenty/engenty-<service>` and tagged
`:latest`, `:vX.Y.Z` and `:<sha>`. So one tag produces two image sets — private
`engenty-pro-*` from this repo, public `engenty-*` from the mirror — and someone
installing on a VPS pulls rather than builds.

Nothing has to be configured to point a compose file at the right set. The
snapshot rewrites the prebuilt deploy files as it publishes them, dropping
`-pro` from every image name: the pro tree says `engenty-pro-edge` and
the mirror says `engenty-edge`, same file, no variable to remember on either
side.

### The npm CLI package

The same tag also publishes `packages/cli` to npmjs as **`engenty`**, so
`npx engenty create`, `npx engenty deploy` and `npx engenty doctor --remote`
exist at the release's version. `scripts/publish-cli.mjs` stages the package,
bakes in the release's open schemas, migrations and public compose templates,
and refuses to publish if the bundle mentions a closed path.

This publishes **from the mirror**, not from here — the package is built from
the open tree, so its npm provenance points at the repository users can read.
Same hand-install rule as the images: `.github/workflows/publish-cli.yml` in
this repo is the reviewable source, guarded to `engenty/engenty` so it never
runs here, and the mirror needs its own copy committed directly **under that
exact filename**. Pro's tag runs `check-cli-package.yml` instead, which stages
the same package and dry-runs it as a closed-path leak check.

Auth is **npm Trusted Publishing** (GitHub OIDC) — no `NPM_TOKEN`, nothing to
rotate. The token path it replaced had been failing with E403 since v0.2.10. The
trusted publisher on npmjs pins org `engenty`, repo `engenty`, workflow
`publish-cli.yml`, no environment, and must allow `npm publish` rather than only
`npm stage publish`. Renaming the workflow file or adding a GitHub environment
to the job breaks publishing silently.

To re-publish a version after a fix:
`gh workflow run publish-cli.yml --repo engenty/engenty -f version=X.Y.Z`.

Two things about the images workflow are easy to get wrong:

- **It is installed on the mirror by hand.** The snapshot deliberately keeps the
  mirror's `.github/workflows` and drops this repo's, because
  `PUBLIC_REPO_PUSH_TOKEN` is Contents-scoped and GitHub rejects any push that
  touches a workflow file. This repo's copy at `.github/workflows/publish-images.yml`
  is the reviewable source, not the thing that runs — **re-copy it to the mirror
  whenever it changes here.** It has already drifted once: the per-user `browser`
  image was added here and the mirror kept building six services while the
  public compose pulled seven.
- **A new GHCR package is created private, and belongs to the repo that pushed
  it.** There is no API for package visibility — making the set public is a
  manual step in each package's settings, and it only takes effect when the org
  allows public packages and the source repo is itself public. A package another
  repo created cannot be pushed to at all: the build fails with
  `denied: permission_denied: read_package`, which does not name the real cause.

## Package versions (separate track)

Published `@engenty/*` packages are versioned independently with
[changesets](https://github.com/changesets/changesets) — that only matters once
packages are published for external consumption, and does not affect the product
release version above.
