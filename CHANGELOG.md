# Changelog

All notable changes to Engenty. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [0.1.10] - 2026-07-12
- Fixed [ci]: Keep public repo workflows untouched in open-source snapshot

## [0.1.9] - 2026-07-09
- Added [time-tracking]: Push time entries to calendar (Phase 2)
- Added [time-tracking]: Calendar overlay (Phase 1)
- Fixed [ci]: Drop stray .claude/worktrees gitlink breaking submodule checkout

## [0.1.8] - 2026-07-09
- Added [deploy]: Apply Supabase migrations automatically on deploy
- Added [authz]: Roles & capabilities authorization with member access gating

## [0.1.7] - 2026-07-08
- Fixed [copilot]: Restore pnpm kill script entry
- Removed [copilot]: Frontend-tool confirmation
- Added [copilot]: Per-tab agent session binding, realtime sync, and unified status UI
- Fixed [projects]: Resolve lint failure blocking pnpm fix on main

## [0.1.6] - 2026-07-08
- Added [time-tracking]: Calendar polish — animated weekend, dropdown pickers, vibrant entries
- Added [time-tracking]: Work-week calendar with collapsible weekend, compact toolbar
- Added [time-tracking]: Calendar view with drag-to-track time entries
- Fixed [time-tracking]: Correct today navigation and week-switch scroll reset
- Fixed [design-tokens]: Define missing --amber accent (--chart-4 resolved to nothing)

## [0.1.5] - 2026-07-08
- Added **[tasks]**: Plugin list columns and group-by project
- Added **[projects]**: Tasks column, sidebar layout, and linked-task counts
- Added **[time-tracking]**: Improve section headers with SPA entity links
- Added **[projects]**: Confirm project delete with optional task cascade
- Fixed **[ui]**: Resolve ui-plugin-sdk from workspace source in dev
- Fixed **[ci]**: Publish-open without checkout credential helper
- Fixed **[time-tracking]**: Stabilize bootstrap and breadcrumb user picker
- Fixed **[time-tracking]**: Scope team catalog to tenant admins

## [0.1.4] - 2026-07-08
- Added: Enrich Engenty admin links with live counts
- Added: Rename AI models label and add Engenty admin links
- Added: Use squared logo tiles with initials fallback
- Docs: Add unreleased changelog entries
- Fixed: Show module icons in settings sidebar
- Fixed: Gate developer settings behind developer mode
- Fixed: Restore root label and hide empty topbar
- Fixed: Pin company-profile in apps/ui deps for settings shell imports
- Fixed: Repair pnpm-lock.yaml after merge and add lockfile gate

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
