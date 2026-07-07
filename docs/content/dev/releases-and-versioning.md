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

Releases are **deliberate and local** — you run one command when you decide to
cut one. Deploys are separate (see below), so a release never triggers a build.

```bash
pnpm release              # full: changelog + bump package.json + commit + tag
pnpm release --changelog-only   # just draft/write the changelog, no bump/commit/tag
```

`pnpm release` (`scripts/release.mjs`) is an interactive stepper that:

1. Reads the Conventional Commits since the last tag via
   [git-cliff](https://git-cliff.org) and shows the **compact changelog** —
   `- Added: …`, `- Fixed: …`.
2. Asks **patch / minor / major** (it suggests one from the commit types; you
   choose). It shows the resulting `vX.Y.Z`.
3. Lets you **edit the entry** in `$EDITOR` before committing.
4. Writes `CHANGELOG.md` (compact) **and** `changelog.json` (structured — the
   source for docs/website generation), then bumps `package.json`, commits
   `chore(release): vX.Y.Z`, and tags it.

It never pushes, builds, or deploys. Afterwards:
`git push origin main --follow-tags`, and deploy as its own step.

The format and grouping live in [`cliff.toml`](https://git-cliff.org/docs/configuration);
change the template there, not in the script.

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

Example: `feat(inbox): add label filters` → `- Added: …`, patch;
`feat(auth)!: drop legacy session cookie` → a **minor** bump.

## Pro / public

The product version is **shared** across `engenty-pro` and the public
`engenty` repo — the same release is tagged in both. The public `CHANGELOG.md`
is the curated, user-facing log; closed-source changes (Manage, licensed fonts)
go in an internal addendum, but the **version string is one** so support and
debugging line up regardless of which repo someone is on.

## Package versions (separate track)

Published `@engenty/*` packages are versioned independently with
[changesets](https://github.com/changesets/changesets) — that only matters once
packages are published for external consumption, and does not affect the product
release version above.
