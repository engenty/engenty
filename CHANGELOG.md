# Changelog

All notable changes to Engenty. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [0.1.21] - 2026-07-14
- FIXED **[inbox]** Declare @engenty/ui-icons dependency

## [0.1.20] - 2026-07-14
- ADDED **[artifacts]** Project artifacts tab uses standard list views
- ADDED **[artifacts]** Phase D core — editing, download, search indexing
- FIXED **[app-shell]** Widen modules rail and align dock iconography
- OTHER Improve copilot FAB prompt launcher UX and status flap behavior.

Unify Float and Prompt into one speed-dial action that restores the last compact mode, make dial rows fully clickable, fix floating drag bounds to use measured launcher size, and animate status flap expand/collapse with persisted height.

Co-authored-by: Cursor <cursoragent@cursor.com>

## [0.1.19] - 2026-07-13
- ADDED **[artifacts]** Phase C — external project storage
- PERFORMANCE **[deploy]** Split pnpm install via pnpm fetch to fix Docker layer caching

## [0.1.18] - 2026-07-13
- ADDED **[time-tracking]** Outlook calendar overlay parity
- ADDED **[time-tracking]** Calendar sync settings — scope + company overlays (Phase 4)
- ADDED **[time-tracking]** Calendar pull-back / two-way sync (Phase 3)
- DOCS **[time-tracking]** Resolve calendar-sync open questions (overlay=calendar-only, push=all/all-future prompt, provider+delete as planned)
- DOCS **[time-tracking]** Mark calendar-sync phases 1-2 shipped, task list for phases 3-4 + Outlook parity

## [0.1.17] - 2026-07-13
- ADDED **[artifacts]** Phase B — promotion + surfaces

## [0.1.16] - 2026-07-13
- ADDED **[ai-ui]** File & photo upload in chat composer (all surfaces)
- CHANGED **[ai-ui]** Improve attachment preview margins in composer
- FIXED **[chat-upload]** Widen submitMessage to carry attachments, redesign attachment tiles, separate attachments from bubble
- FIXED **[chat-upload]** Resolve coreBaseUrl fallback, durable attachment persistence, and Gateway file-part encoding
- FIXED **[chat-upload]** Feed model + persist attachments; AI SDK tile variants

## [0.1.15] - 2026-07-13
- ADDED **[copilot]** Prefer artifacts for documents; bound frontend-tool interrupts
- ADDED **[engenty-copilot]** Show_artifact frontend tool — open the pane on a specific artifact
- ADDED **[ai-ui]** Real artifact pane — server-backed list, renderers, realtime, open-in-pane
- ADDED **[ai]** Artifacts backend — DAL, HTTP routes, type registry, copilot tools
- ADDED **[ai]** Ai.artifact + ai.artifact_version tables and realtime
- DOCS **[artifacts]** Mark Phase A done with deviations + realtime gotcha
- FIXED **[artifacts]** Review fixes — DAL atomicity, 4xx error mapping, pane/tool-call UI states, interrupt TTL rework
- FIXED **[copilot]** Expose artifact tools to the model and thread-scope the chat runtime

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
