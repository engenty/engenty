# Changelog

All notable changes to Engenty. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [Unreleased]
- Fixed: Restore root label and hide empty topbar
- Fixed: Pin company-profile in apps/ui deps for settings shell imports
- Fixed: Repair pnpm-lock.yaml after merge and add lockfile gate

## [0.1.3] - 2026-07-08
- Added: Overhaul settings page with modules, users, and plugins
- Added: Wire real plugins with filtering and collapsed connections
- Added: Wire real users with role and team member status
- Changed: Redesign settings page with identity header and stacked layout
- Docs: Add /release skill steering work modes + release flow
- Docs: Consolidate scattered dev sections into one clear Develop block
- Fixed: Stabilize tests and finish settings overhaul polish
- Fixed: Use module icons from contributions and descriptions from manifest
- Fixed: Pull_policy: always so the VPS pulls new :latest images
- Fixed: Correct post-release hint — pushing the tag builds+deploys

## [0.1.2] - 2026-07-07
- Docs: Clarify dev + release/ship flow across README, CONTRIBUTING, dev doc
- Fixed: Create annotated tag so --follow-tags pushes it

## [0.1.1] - 2026-07-07
- Added: App menu with brand, version, settings and about
- Added: Render CHANGELOG at /changelog from changelog.json
- Fixed: Hardcode GHCR sandbox image in prebuilt compose

## [0.1.0] - 2026-07-07

- Added: Coolify deploy pipeline — prebuilt GHCR images with SSH-triggered auto-deploy
- Added: Guided deploy wizard (`deploy/scripts/deploy-wizard.mjs`)
- Added: Docs — Coolify setup guide covering exposed schemas, auth hook, and the Traefik network pin
