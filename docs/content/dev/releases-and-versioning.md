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

Releases are **deliberate, not per-push**. Deploys still happen on every push to
`main`; a release is an *annotation* over that stream.

1. Land work on `main` with **Conventional Commit** messages (see below).
2. [release-please](https://github.com/googleapis/release-please) keeps a rolling
   **"chore: release 0.x.y"** pull request open, updating `CHANGELOG.md` and the
   version bump as commits land.
3. When you want to cut a release, **merge that PR**. release-please then tags
   `v0.x.y` and publishes a GitHub Release from the changelog.

That merge is the only manual step — everything else is derived from commits.

## Conventional Commits

The commit **type** drives the changelog section and the version bump:

| Type | Changelog section | Bump (pre-1.0) |
|------|-------------------|----------------|
| `feat:` | Features | patch |
| `fix:` | Bug Fixes | patch |
| `perf:` | Performance | patch |
| `deploy:` | Deployment & Ops | patch |
| `docs:` | Documentation | patch |
| `refactor:` / `chore:` / `test:` | (hidden) | patch |
| any type + `!` or `BREAKING CHANGE:` footer | — | **minor** |

Example: `feat(inbox): add label filters` → a patch bump under **Features**;
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
