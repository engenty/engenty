# Changelog

All notable changes to the Engenty product are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/), and versions follow
[Semantic Versioning](https://semver.org/) — while pre-`1.0`, a **minor** bump
signals a notable or breaking change and a **patch** bump covers fixes and small
features.

Entries below `0.1.0` are curated by hand; from `0.1.0` onward this file is
maintained automatically by release-please from Conventional Commit messages.
See [docs/content/dev/releases-and-versioning.md](docs/content/dev/releases-and-versioning.md).

## [0.1.0] - 2026-07-07

Baseline alpha release — the first versioned cut.

### Deployment & Ops

- Production deploy on Coolify from prebuilt GHCR images, with SSH-triggered
  auto-deploy that leaves the Coolify API IP allow-list untouched.
- Guided `deploy/scripts/deploy-wizard.mjs` — interactive stepper that configures
  Supabase (exposed schemas + custom access-token hook), writes `deploy/.env`,
  and creates + deploys the Coolify application.

### Documentation

- Coolify deployment guide and `deploy/DEPLOY.md` covering the prebuilt-images CI
  pipeline, base directory, schema/auth-hook setup, and the Traefik network pin.
