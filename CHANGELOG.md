# Changelog

All notable changes to Engenty. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [0.1.14] - 2026-07-13
- ADDED **[ai-ui]** Shared WorkspaceArtifactPane — tasks detail gets the artifact split
- ADDED **[ai-ui]** Expand control on the artifact pane
- ADDED **[app-shell]** Workspace end-pane slot — artifact pane spans full workspace height
- ADDED **[ai-ui]** Artifact pane + pane primitives — copilot chat split view
- ADDED **[projects]** Collapsible time plan, zoom slider fix, add-member link
- ADDED **[ui-core]** DocSidebar — responsive document sidebar; adopt on task detail
- CHANGED **[tasks]** Card surfaces on ui-canvas classes per DESIGN.md
- DOCS **[artifacts]** Implementation guide for phases A+B with outcome-test plan
- DOCS **[artifacts]** Files-sdk as storage adapter layer, connections as credential layer
- DOCS Artifacts backend & lifecycle spec (wip)
- DOCS Record workspace end-pane layout decision
- DOCS Phase 2 foundation status in app-shell unification doc
- DOCS Phase 1 status in app-shell unification doc
- DOCS **[release]** Uppercase change groups, bold module scopes
- DOCS App shell unification concept (wip)
- FIXED **[app-shell]** Narrow compact sidebar rail to 48px and stop menu-open shift
- FIXED **[app-shell]** Expanded end pane stays within the workspace row
- FIXED **[engenty-copilot]** Topbar action order — CTA, menu, pane toggle
- FIXED **[release]** Raise git-cliff maxBuffer to avoid ENOBUFS
- OTHER Migrate HR & employment module into pro (closed) (#14)

## [0.1.13] - 2026-07-13
- ADDED **[ai-ui]** Richer transcript rows for external connector tools
- ADDED **[browser-bridge]** Agent-controlled browser window via companion extension
- ADDED **[connections]** Import external connectors from OpenAPI specs, MCP servers, and the integrations.sh registry
- FIXED **[docs]** Add required title frontmatter to internal time-tracking doc
- FIXED **[ai]** Serialize parallel tool-approval suspensions and resume reliably

## [0.1.12] - 2026-07-13
- CHANGED Make time-tracking module pro-only

## [0.1.11] - 2026-07-12
- ADDED **[tasks]** Bulk delete, project column, and group-level select in task list

## [0.1.10] - 2026-07-12
- FIXED **[ci]** Keep public repo workflows untouched in open-source snapshot

## [0.1.9] - 2026-07-09
- ADDED **[time-tracking]** Push time entries to calendar (Phase 2)
- ADDED **[time-tracking]** Calendar overlay (Phase 1)
- FIXED **[ci]** Drop stray .claude/worktrees gitlink breaking submodule checkout

## [0.1.8] - 2026-07-09
- ADDED **[deploy]** Apply Supabase migrations automatically on deploy
- ADDED **[authz]** Roles & capabilities authorization with member access gating

## [0.1.7] - 2026-07-08
- FIXED **[copilot]** Restore pnpm kill script entry
- REMOVED **[copilot]** Frontend-tool confirmation
- ADDED **[copilot]** Per-tab agent session binding, realtime sync, and unified status UI
- FIXED **[projects]** Resolve lint failure blocking pnpm fix on main

## [0.1.6] - 2026-07-08
- ADDED **[time-tracking]** Calendar polish — animated weekend, dropdown pickers, vibrant entries
- ADDED **[time-tracking]** Work-week calendar with collapsible weekend, compact toolbar
- ADDED **[time-tracking]** Calendar view with drag-to-track time entries
- FIXED **[time-tracking]** Correct today navigation and week-switch scroll reset
- FIXED **[design-tokens]** Define missing --amber accent (--chart-4 resolved to nothing)

## [0.1.5] - 2026-07-08
- ADDED **[tasks]** Plugin list columns and group-by project
- ADDED **[projects]** Tasks column, sidebar layout, and linked-task counts
- ADDED **[time-tracking]** Improve section headers with SPA entity links
- ADDED **[projects]** Confirm project delete with optional task cascade
- FIXED **[ui]** Resolve ui-plugin-sdk from workspace source in dev
- FIXED **[ci]** Publish-open without checkout credential helper
- FIXED **[time-tracking]** Stabilize bootstrap and breadcrumb user picker
- FIXED **[time-tracking]** Scope team catalog to tenant admins

## [0.1.4] - 2026-07-08
- ADDED Enrich Engenty admin links with live counts
- ADDED Rename AI models label and add Engenty admin links
- ADDED Use squared logo tiles with initials fallback
- DOCS Add unreleased changelog entries
- FIXED Show module icons in settings sidebar
- FIXED Gate developer settings behind developer mode
- FIXED Restore root label and hide empty topbar
- FIXED Pin company-profile in apps/ui deps for settings shell imports
- FIXED Repair pnpm-lock.yaml after merge and add lockfile gate

## [Unreleased]
- FIXED Restore root label and hide empty topbar
- FIXED Pin company-profile in apps/ui deps for settings shell imports
- FIXED Repair pnpm-lock.yaml after merge and add lockfile gate

## [0.1.3] - 2026-07-08
- ADDED Overhaul settings page with modules, users, and plugins
- ADDED Wire real plugins with filtering and collapsed connections
- ADDED Wire real users with role and team member status
- CHANGED Redesign settings page with identity header and stacked layout
- DOCS Add /release skill steering work modes + release flow
- DOCS Consolidate scattered dev sections into one clear Develop block
- FIXED Stabilize tests and finish settings overhaul polish
- FIXED Use module icons from contributions and descriptions from manifest
- FIXED Pull_policy: always so the VPS pulls new :latest images
- FIXED Correct post-release hint — pushing the tag builds+deploys

## [0.1.2] - 2026-07-07
- DOCS Clarify dev + release/ship flow across README, CONTRIBUTING, dev doc
- FIXED Create annotated tag so --follow-tags pushes it

## [0.1.1] - 2026-07-07
- ADDED App menu with brand, version, settings and about
- ADDED Render CHANGELOG at /changelog from changelog.json
- FIXED Hardcode GHCR sandbox image in prebuilt compose

## [0.1.0] - 2026-07-07

- ADDED Coolify deploy pipeline — prebuilt GHCR images with SSH-triggered auto-deploy
- ADDED Guided deploy wizard (`deploy/scripts/deploy-wizard.mjs`)
- ADDED Docs — Coolify setup guide covering exposed schemas, auth hook, and the Traefik network pin
