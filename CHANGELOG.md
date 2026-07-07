# Changelog

All notable changes to Engenty. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [0.1.1] - 2026-07-07
- Added: App menu with brand, version, settings and about
- Added: Render CHANGELOG at /changelog from changelog.json
- Fixed: Hardcode GHCR sandbox image in prebuilt compose

## [0.1.0] - 2026-07-07

- Added: Coolify deploy pipeline — prebuilt GHCR images with SSH-triggered auto-deploy
- Added: Guided deploy wizard (`deploy/scripts/deploy-wizard.mjs`)
- Added: Docs — Coolify setup guide covering exposed schemas, auth hook, and the Traefik network pin
