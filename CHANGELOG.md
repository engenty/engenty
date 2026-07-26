# Changelog

All notable changes to Engenty. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [0.1.79] - 2026-07-26
- FIXED **[deploy]** Verify the agentos-apps patch without require.resolve

## [0.1.78] - 2026-07-26
- ADDED **[apps]** App-build workflow — the durable sequence behind app_build
- FIXED **[deploy]** Copy patches before pnpm fetch so images build again
- FIXED **[copilot]** Give the supervisor an agent-app_coder delegation tool
- OTHER Moved plans out of repo

## [0.1.77] - 2026-07-26
- ADDED **[ai-ui]** Gate expert model pinning on developer mode, show bound models
- ADDED **[manage]** Add the role binding console
- ADDED **[ai]** Effort selector replaces the model picker
- ADDED **[ai]** Make the gateway a column behind an adapter interface
- ADDED **[ai]** Let modules declare the model roles they need
- ADDED **[ai]** Plans grant effort tiers instead of enumerating model ids
- ADDED **[ai]** Resolve models from role bindings instead of env and constants
- ADDED **[ai-ui]** Include agents in the composer @ mention picker
- ADDED **[manage]** Add AI model console and allow-list editors
- ADDED **[ai]** Govern model selection through one shared allow-list
- ADDED **[ai]** Realtime voice cascade providers and chat-command skills
- ADDED **[manage]** Add platform settings under Settings with secondary nav
- DOCS How effort levels and model configuration work
- FIXED **[ai]** Isolate the placeholder session workspace per user
- FIXED **[core]** Make the model-gateway migration re-runnable
- FIXED **[ai-ui]** Correct import depth in use-mention-agent-candidates
- FIXED **[manage]** Drop duplicate formatMicros import from the merge

## [0.1.76] - 2026-07-26
- ADDED **[kb-filesystem-sync]** Migrate KB filesystem sync module from legacy repo
- ADDED **[doc-converter]** Add Mistral OCR as a document extraction provider
- FIXED **[manage]** Unify money formatting to Intl.NumberFormat + pin test locale
- FIXED **[app-host]** Stub deployApp so runtime guard tests need no Rivet engine

## [0.1.75] - 2026-07-26
- ADDED **[ai-ui]** Open work files in the chat-style artifact pane
- ADDED **[tasks]** Move routine actions into the topbar
- ADDED **[tasks]** Polish routine detail with cards, markdown, and tool picker
- ADDED **[ai-ui]** Browse work-panel files as a card grid with preview
- ADDED **[ai-ui]** Calm Engenty admin list hubs like Plan
- ADDED **[apps]** Bundle multi-file React frontends on the host
- ADDED **[apps]** Add app_config, and enforce the storage manifest flags
- ADDED **[apps]** Harden the engenty Apps runtime
- ADDED **[apps]** Make Apps usable by copilot and coordinator
- ADDED **[apps]** Add engenty.coder — the agent that authors engenty Apps
- ADDED **[apps]** Add the engenty Apps capability wall in apps/ai
- ADDED **[apps]** Render engenty Apps in the artifact pane via a bridged frame
- ADDED **[apps]** Add modules/engenty-apps — apps, versions, governance, catalog ops
- ADDED **[apps]** Add apps/app-host — runtime for tenant-authored engenty Apps
- CHANGED **[apps]** Rename engenty.coder to engenty.app-coder
- DOCS **[apps]** Add engenty Apps end-to-end test plan
- DOCS **[apps]** Re-spike SQLite against the Rivet cookbooks
- DOCS **[apps]** Add engenty Apps plan + Phase 0 agentOS spike findings
- FIXED **[test]** Enable Node localStorage for happy-dom vitest runs
- FIXED **[apps]** Satisfy lint for app-host and engenty-apps
- FIXED **[ui]** Keep Setup in the tenant app and add overview page
- FIXED **[tasks]** Put routine run CTA leftmost in the topbar
- FIXED **[apps]** Unwrap store envelopes in engenty:bridge
- FIXED **[apps]** Keep the app-host id inside agentOS's 63-character limit
- FIXED **[apps]** Give agentOS a backend entrypoint, or App backends never run
- FIXED Strip closed plugins from the public engenty.plugins map
- FIXED **[auth]** Time out setup fetches so a hung backend cannot hang login

## [0.1.74] - 2026-07-25
- ADDED **[tasks]** Center list toolbar and polish briefing motion stream
- ADDED **[tasks]** Redesign Plan briefing hub and calm list surfaces
- ADDED **[ui-core]** Add aboveStrip and belowStrip alignment options to DetailPageHeader
- ADDED **[tasks]** Add Plan list header tabs for tasks, goals, routines
- ADDED **[tasks]** Calm list headers, group-by toolbar, and Plan module label
- ADDED **[tasks]** Unify list page headers and routines list controls
- ADDED **[workspace]** Enhance workspace file tools and context handling
- ADDED **[ui]** Make Geist the default appearance font, OS stack as System Default
- CHANGED **[tasks]** Update DetailPageHeader to use aboveStrip for navigation
- FIXED **[team]** Align skill frontmatter name with pack folder
- FIXED **[core]** Collect audit distincts via keyset so later module ids appear
- FIXED **[tasks]** Unblock typecheck for run-now repo and list helpers
- FIXED **[ai]** Re-export commons storage prefix via export-from
- FIXED **[tasks]** Apply sidebar list settings to routines
- FIXED **[tasks]** Move sidebar search under list tabs

## [0.1.73] - 2026-07-24
- ADDED **[tasks]** Standing-task schedule routines with agent disposition
- DOCS Where-work-lives — rebase on shipped hardening + routine work (absorption list, tool-based Phase 3)

## [0.1.72] - 2026-07-24
- ADDED **[tasks]** Harden dispatch rails, typecheck UI, and blocked reasons
- ADDED **[queue]** At-least-once delivery with dead-letter cap
- ADDED **[ai]** Finish Mastra 1.52 schedules upgrade and message-shape fixes
- DOCS Update harness hardening plan checklists after implementation
- DOCS Where-work-lives — add storage-roles doctrine (§1b) + mirror-follows-versions
- DOCS Plan — where work lives: one scope model for artifacts, files & workspaces
- DOCS Plan — harness hardening (gap register + Mastra 1.52 completion)
- DOCS Plan rev 2.1 — trim discussion-only OpenClaw references, keep implementation semantics
- DOCS Plan rev 2 — routines run on ONE standing task with agent-decided disposition
- DOCS Plan — promote routines from task templates to scheduled specialists
- FIXED **[team]** Use interfaces for Habbo avatar option types

## [0.1.71] - 2026-07-24
- ADDED **[auth-ui]** Use engenties on login and setup surfaces
- ADDED **[team]** Generate Habbo avatars via Gemini with edge cleanup

## [0.1.70] - 2026-07-24
- FIXED **[deploy]** Survive the edge cold build — raise DTS heap, drop concurrency

## [0.1.69] - 2026-07-24
- ADDED **[deploy]** Build and ship the Manage portal in the edge image
- FIXED **[ui]** Gate the entire /setup surface to superadmins
- FIXED **[docs]** Add frontmatter to the internal docs moved out of docs/wip

## [0.1.68] - 2026-07-23
- ADDED **[manage]** Enhance tenant package details and enforcement settings
- ADDED **[manage]** Align list and detail chrome with core UI patterns
- ADDED **[manage]** Package detail, tenants package column, and create chooser
- ADDED **[core]** Expose tenant package_id and accept it on create
- ADDED **[manage]** List/detail UI refresh for tenants, users and packages
- ADDED **[manage]** Core-UI DetailPageHeader for the tenant detail page
- ADDED **[ai]** Governance seam for self-managed vs centrally-managed AI settings
- ADDED **[manage]** Readable feature-flag labels (P4d parity)
- ADDED **[manage]** Search-index diagnostics console (P4d)
- ADDED **[manage]** Tenant automation-rules tab (P4d)
- ADDED **[manage]** Approvals queue, module lifecycle, and platform settings (P4b/P4c)
- ADDED **[manage]** P4a observability — logs inspector + cross-tenant audit
- ADDED **[billing]** P3 package pricing, invoices, tenant billing tab
- ADDED **[satellites]** P2b satellite registry, health probe, manage UI
- ADDED **[entitlements]** P2a-5 manage UI (catalog, picker, overrides, resolved)
- ADDED **[entitlements]** P2a-4d maxUsers seat-limit enforcement
- ADDED **[entitlements]** P2a-4c write AI usage policy on entitlement change
- ADDED **[entitlements]** P2a-4b module allow-list enforcement
- ADDED **[entitlements]** P2a-4a compose package feature flags
- ADDED **[entitlements]** P2a-3 superadmin entitlements routes
- ADDED **[entitlements]** P2a-2 core.packages DB + DAL + boot sync
- ADDED **[entitlements]** P2a-1 authored package catalog + resolver
- ADDED **[manage]** Tenant control-plane Phase 1 (tenants, users, modules, flags)
- ADDED **[tasks]** Make agent task runs durable and consistent
- CHANGED **[entitlements]** One file per commercial package
- CHANGED **[manage]** Retrofit Phase 1 lists to the design system
- DOCS Point entitlements catalog at config/packages
- DOCS **[wip]** Unify tenancy plans into one two-tier spec (platform + satellites, manage app)
- DOCS **[wip]** Tenancy & deployment architecture — converged on plane split + tenant sandboxes
- DOCS **[wip]** Tenant sandbox runtime plan — independent base layer
- DOCS **[wip]** Tenant-box + OD headless spike charter (phase 0)
- FIXED **[coordinator]** Match the test to the heartbeat routine that shipped
- FIXED **[tasks,core]** Run details reveal the thread; repair Vitest 4 test signature
- FIXED **[core]** Tenant-scope the approval queue, add superadmin cross-tenant routes
- FIXED **[manage]** Recover to login on an expired/invalid session
- FIXED **[manage]** Make Phase 1 runnable via portless dev
- OTHER Add CardSection and align detail page content columns.

Centralize section title + card layouts (with header/body variants) so modules stop hand-rolling typography, and pad detail content inside max-width to match DetailPageHeader.

Co-authored-by: Cursor <cursoragent@cursor.com>

## [0.1.67] - 2026-07-23
- ADDED **[inbox]** Add AI face for triage, sync, and UI tools
- ADDED **[agent-ui]** Richer page briefs and DOM-first UI inspection
- ADDED **[copilot]** Add copy-thread action to the drawer menu
- FIXED **[ui]** Register the copilot composer draft bridge in the drawer
- FIXED **[ai]** Refresh invoices and offers agent skill docs
- FIXED **[ag-ui-bridge]** Unblock page-brief dts build for DOM region exports
- OTHER Always allow comments on tasks by agents

## [0.1.66] - 2026-07-22
- ADDED **[tasks]** Durable tool approvals for routine/task runs + routine linkage

## [0.1.65] - 2026-07-22
- ADDED **[ai]** Tiered chat attachments and file-analyst sub-agent
- ADDED **[import]** Clean CSV after upload and expose cleanup_csv tool
- FIXED **[import]** Type onCleanup callbacks for module DTS builds
- FIXED **[core]** Update startApiServer test to Vitest 4 it(name, options, fn) signature

## [0.1.64] - 2026-07-22
- ADDED **[tasks]** LLM inbox headlines, mark-as-seen, leaner sidebar nav
- ADDED **[tasks]** Richer inbox (needs-input vs notifications) + grouped sidebar
- ADDED **[tasks]** Project-style rows + 3-dot menu for goal linked tasks
- ADDED **[tasks]** Human/Agent filter toggle on tasks + goals lists
- ADDED **[tasks]** Goals list cards view + view chooser (list/cards, no kanban)
- ADDED **[tasks]** Hand a goal to the Coordinator (owner + planning kick-off)
- FIXED **[tasks]** Bump goal-owner migration to 20260722160100 (avoid version collision with core ai_agent_overrides)
- FIXED **[tasks]** Create agent_coordinator_dispatch pgmq queue in migration
- FIXED **[tasks]** Cards view default + first, scrollable cards, row-cards icon
- OTHER **[tasks]** Inbox rows — collapse preview whitespace, animated check dismiss
- OTHER **[tasks]** Compact full-width inbox rows + Clear-all, drop per-row seen

## [0.1.63] - 2026-07-22
- ADDED **[ui-icons]** Add Setup and Context Graph dock icons
- FIXED **[engenty-copilot]** Pin session sidebar and polish chat list rows

## [0.1.62] - 2026-07-22
- ADDED **[ai-settings]** Merge AI usage as a tab + move page to /setup/ai
- ADDED **[ai-settings]** Unified DetailPageHeader with title + tab strip

## [0.1.61] - 2026-07-21
- ADDED **[memory]** Core DetailPageHeader tabbed header on /settings/memory
- FIXED **[auth]** Stop dev-login ensure from revoking other Portless sessions
- FIXED **[memory]** Doc-editor dirty false-positives, handle-inside-card, aligned record cards

## [0.1.60] - 2026-07-21
- ADDED **[ui-core]** Add list toolbar hotkeys for search, filters, and new
- ADDED **[secrets]** Adopt list toolbar and richer vault reveal UX
- FIXED **[memory]** Org-tab list, memory_save boundary, frosted editor popovers
- OTHER Lint fix
- OTHER Removed from repo
- OTHER **[secrets]** Tighten vault chrome and sidebar scope
- OTHER Removed useless biome hints

## [0.1.59] - 2026-07-21
- FIXED **[core]** Skip platform-settings hydrate when Supabase is unreachable

## [0.1.58] - 2026-07-21
- FIXED Point runtime SDK packages at dist and sync nav tests

## [0.1.57] - 2026-07-21
- ADDED **[ai]** Per-agent iteration cap (limits.max_steps) governance dial
- ADDED **[tasks]** Task dependency graph — blocked_by_task_ids + auto-wake (coordination Phase 1)
- DOCS Plan for agent coordination — task dependency graph, doctrine skills, capability catalog

## [0.1.56] - 2026-07-21
- ADDED **[ai-ui]** Agent-proposal approval UI on the admin overview
- ADDED **[platform-settings]** Platform-wide settings, tenant credential overrides & connection agent
- ADDED **[ai-ui]** Agent-proposal approval UI on the admin overview
- FIXED **[platform-settings]** SLACK_BOT_TOKEN is platform-scoped in the config test

## [0.1.55] - 2026-07-21
- ADDED **[ai]** Agent_propose — governed agent-registry writer for the coordinator

## [0.1.54] - 2026-07-21
- FIXED **[ai-ui]** Narrow tenant-settings response before reading value

## [0.1.53] - 2026-07-21
- ADDED **[settings]** Enhance plugin deactivation flow and add dependency handling
- ADDED **[settings]** Add Connections overview and stronger icon tiles
- ADDED **[settings]** Add Engenty admin links to settings overview
- ADDED **[settings]** Move roles to Setup and add AI overview cards
- ADDED **[engenty-remote]** Assign engenty plugin category
- ADDED **[settings]** Add plugin categories and group Settings by catalog
- ADDED **[settings]** Add language picker to Appearance overview card
- ADDED **[ui]** Move plugins under Setup and add Appearance overview
- DOCS **[memory]** Add developer and user docs for agent memory
- FIXED **[settings]** Drop redundant labels on Appearance overview card
- FIXED **[settings]** Restore Settings sidebar header on /settings/* pages
- FIXED **[memory]** Remove dead copilot memory-settings page
- OTHER Update module dependencies
- OTHER Better icon sizes

## [0.1.52] - 2026-07-21
- FIXED **[engenty-remote]** Resolve migration timestamp collision blocking all migrations
- FIXED **[memory]** Declare UI in manifest so apps/ui dep survives sync (CI lockfile guard)

## [0.1.51] - 2026-07-21
- ADDED **[memory]** Memory document UI — TipTap doc projection + diff-sync (Phase 6)
- ADDED **[memory]** Weekly consolidation routine (Phase 5)
- ADDED **[memory]** Org governance + skill self-authoring (Phase 4)
- ADDED **[memory]** Entity memory — validated refs, auto-recall, contact Agent-notes card (Phase 3)
- ADDED **[memory]** Reflection loop — post-task reflect step + prior-learnings briefs (Phase 2)
- ADDED **[memory]** Memory module core — store, gateway ops, retrieval source, agent tools (Phase 1)

## [0.1.50] - 2026-07-20
- FIXED **[app-shell]** Stop settings separators from stealing /setup secondary nav

## [0.1.49] - 2026-07-20
- FIXED **[remote]** Grant service_role on module_remote + surface settings errors
- FIXED **[ui]** Tighten favicon framing so the blob fills the icon

## [0.1.48] - 2026-07-20
- ADDED **[ui]** Refreshed favicon/icon set + serve root favicons from the SPA
- ADDED **[modules]** Tag published modules with open/pro tier from CLOSED_PREFIXES
- ADDED **[cli]** Engenty modules add — install a module from the registry (Level A / A4)
- ADDED **[remote]** Settings UI, pairing claim page, identity-gate tests, docs
- ADDED **[remote]** Identity pairing, delegated actor tokens, proactive queue, Telegram (Phases 2-4 backend)
- ADDED **[remote]** Engenty-remote module + Mastra channels Slack runtime (Phase 1)
- CHANGED **[modules]** --pro opt-in instead of --open-only (safe default)
- FIXED **[environment]** Drop node:module from browser-bundled twin (white screen)
- FIXED **[engenty-remote]** Declare module.engenty-remote.read/write in manifest
- FIXED **[ci]** Cap module-build concurrency + use remote cache in publish workflow

## [0.1.47] - 2026-07-20
- ADDED **[modules]** Publish modules to GitHub Packages as overlays (Level A / A5)
- FIXED **[modules]** Avoid delete in publish transform (lint/performance/noDelete)

## [0.1.46] - 2026-07-20
- FIXED **[ci]** Stop the ai/edge deploy build OOMing (concurrency + reliable cache)

## [0.1.45] - 2026-07-20
- ADDED **[modules]** Load registry-installed modules from node_modules (Level A / A3)

## [0.1.44] - 2026-07-20
- ADDED **[modules]** Package each module as a self-contained tarball (Level A / A1)
- ADDED **[import]** Import from connections and move platform import to /setup
- FIXED **[plugins]** Make checkPluginManifest report missing on-disk plugins
- FIXED **[env]** Sync env example files with the manifest
- FIXED **[deps]** Sync lockfile for time-tracking package deps

## [0.1.43] - 2026-07-20
- ADDED **[notifications]** Make the email notifier source-agnostic
- ADDED **[test]** Add Playwright browser smoke lane
- FIXED **[connections]** Prefer integrations.sh /surface over live /discover

## [0.1.42] - 2026-07-20
- ADDED **[import]** Paste-to-import, Sheets TSV fixes, Secrets import

## [0.1.41] - 2026-07-20
- ADDED **[secrets]** Agent-gated reveals — identity forwarding, approval gate, durable goal grants
- ADDED **[secrets]** Password-manager vault UI with dock icon and client/project filters
- ADDED **[secrets]** Client-anchored secrets vault + services module
- DOCS **[secrets]** Record UI test results (U1-U6) in test plan
- FIXED **[core]** Move supabase client construction behind DAL seam
- FIXED **[dev]** Raise portless readiness probe timeout to 15s
- FIXED **[secrets]** Enforce tenant boundary in secrets_list (BUG-1)

## [0.1.40] - 2026-07-20
- ADDED **[deploy]** Pass SUPABASE_DB_URL + VAPID keys to engenty-ai
- FIXED **[desktop]** ⌥Space opens a new chat; stop native-listener churn on nav

## [0.1.39] - 2026-07-20
- ADDED **[notifications]** Web push channel (N2) — subscriptions, VAPID delivery, SW + profile toggle
- FIXED **[desktop]** Don't register the push service worker on tauri:// origin
- FIXED **[dev]** Pass ENGENTY_DEV_READY_MAX_WAIT_MS through turbo globalEnv
- FIXED **[ui]** Lint — drop unused catch binding + optional chain in push sw

## [0.1.38] - 2026-07-19
- ADDED **[team-chat]** Email notifications via the tenant's connector (N4)
- ADDED **[team-chat]** Slack-bridge binding UI (pro settings page)
- DOCS **[team-chat]** Plan bridge phase 7 — realtime Slack sync + reactions
- DOCS **[user]** Add Connect Slack guide (Slack bridge setup)
- FIXED **[team-chat]** Slack-bridge env var was missing its obtain strategy
- FIXED **[team-chat]** Annotate intentional thenable in slack-bridge test mock
- FIXED **[ci]** Cap turbo build concurrency at the runner's 4 vCPUs
- FIXED **[team-chat]** Slack bridge skips non-autonomous connections instead of erroring
- FIXED **[ci]** Stop cancelling in-progress main builds on new pushes

## [0.1.37] - 2026-07-19
- ADDED **[release]** Build the desktop dmg locally instead of on GitHub
- ADDED **[team-chat]** Slack bridge (pro) — outbound replay, inbound sync, binding ops
- ADDED **[team-chat]** User notifications — mention/DM fan-out into the platform inbox (N1)
- FIXED **[ci]** Persist turbo cache across verify runs
- FIXED **[ci]** Raise verify job timeout to 60min

## [0.1.36] - 2026-07-19
- ADDED **[desktop]** Deeper macOS integration — native menu, hotkey, autostart, drag&drop, realtime inbox, local connector host
- FIXED **[team-chat]** Limit conversation content width on wide viewports

## [0.1.35] - 2026-07-19
- ADDED **[desktop]** Reload via ⌘R + tray menu item; quieter error overlay

## [0.1.34] - 2026-07-19
- ADDED **[team-chat]** Render conversation tabs inline on the dashboard
- ADDED **[team-chat]** Design update — blended header, dashboard tabs, stats, unified author colors
- ADDED **[team-chat]** Unread + pins in activity feed, deep-link anchor scroll
- ADDED **[team-chat]** Activity dashboard on the module home
- ADDED **[team-chat]** Phase 5 — retrieval source, channel details, polish, tests
- ADDED **[team-chat]** Composer attachments (upload/paste images + files) and emoji picker
- ADDED **[team-chat]** Human-readable task activity lines in project channels
- ADDED **[team-chat]** Phase 4 project binding + activity feed; UI rework
- ADDED **[team-chat]** Phase 3 — agents as first-class participants
- ADDED **[team-chat]** Phase 2 — reactions, pins, mentions, edit, search, badge
- ADDED **[team-chat]** Phase 1 — Slack-compatible team messaging module
- DOCS **[team-chat]** Test plan for the design update
- DOCS **[team-chat]** Record dashboard verification
- DOCS **[team-chat]** Record UI polish round in test plan
- DOCS **[team-chat]** Mark details-popover + activity-toggle suppression verified
- DOCS **[team-chat]** Mark search verified, record scope_id indexing bug + guard
- DOCS **[team-chat]** Record Phase 1 live verification + follow-ups
- DOCS **[team-chat]** Design doc for Slack-compatible team-chat module
- FIXED **[deps]** Pin @hookform/resolvers to the consumer's zod via packageExtensions
- FIXED **[team-chat]** Align dashboard header with the content column
- FIXED **[team-chat]** Channel-head member roster, anchor-flash fade, pins popover close
- FIXED **[team-chat]** Action tooltips, anchored emoji picker, threads closed by default, clean index status
- FIXED **[team-chat]** Thread button opens a reply composer on reply-less messages
- FIXED **[team-chat]** Index messages — scope_id lives on conversations, not messages
- FIXED **[team-chat]** Visible hover highlight on message rows

## [0.1.33] - 2026-07-19
- FIXED **[desktop]** Resolve API/AI base URLs lazily + surface uncaught errors in the shell
- FIXED **[desktop-ci]** Dispatch falls back to latest v* tag when no GitHub release exists yet
- FIXED **[desktop-ci]** Host arm64 build — --target broke bundler path; dispatch attaches to latest release

## [0.1.32] - 2026-07-19
- FIXED **[lockfile]** Repair pnpm-lock after desktop rebase onto v0.1.30

## [0.1.31] - 2026-07-19
- ADDED **[desktop]** Tauri macOS shell bundling the web SPA with runtime server config

## [0.1.30] - 2026-07-19
- ADDED **[copilot]** Dock queue + approval surfaces as a flap attached to the composer
- ADDED **[generative-ui]** Rich record panels, internal MCP Apps, A2UI catalog (G1–G3)
- DOCS **[wip]** Note run/resume 409 wedge findings from generative-ui verification (unrelated defect)
- DOCS **[dev]** Add Generative UI page, refresh objects page (panels, askAgent, engenty:internal)
- FIXED **[copilot]** Reconcile orphaned interrupts + recover from 409 resumeInProgress
- FIXED **[a2ui]** Make show_ui actions + data-bindings resolve
- FIXED **[copilot]** Thread-scope the composer message queue and clear it on stop

## [0.1.29] - 2026-07-17
- ADDED **[projects]** Resizable task side panel with delete + full-page actions
- DOCS **[wip]** Generative-ui — correct 'iframe cannot host our components' to the precise claim
- DOCS **[wip]** Generative-ui — adjudicate the MCP-Apps-vs-A2UI challenge per use case

## [0.1.28] - 2026-07-17
- ADDED **[chat]** Slash commands + typed @-mentions in agent chats
- DOCS **[wip]** Mark chat slash-commands implemented + live-verified
- DOCS **[wip]** Record review decisions Q1-Q5 (carrier, aliases, action v1, availability, routing)
- DOCS **[wip]** Object-widgets merged to main — phase 3b dependency satisfied after rebase
- DOCS **[wip]** Chat slash-commands + typed @-mentions design
- DOCS **[wip]** Generative-ui — Q6 decided (A2UI first) + worked wire-format examples
- DOCS **[wip]** Generative-ui — evaluate OpenUI (Thesys) as G3 alternative to A2UI
- DOCS **[wip]** Generative-ui — cite official A2UI React renderer docs
- DOCS **[wip]** Correct generative-ui — A2UI React renderers are shipped, AG-UI carries A2UI
- DOCS **[wip]** Generative-ui design — rich panels, internal MCP Apps, A2UI
- FIXED **[chat]** Unwrap workspace-search match envelope, core group heading, route logger

## [0.1.27] - 2026-07-17
- ADDED **[objects]** Make the whole card clickable
- ADDED **[objects]** Make object card actions follow the chat surface
- ADDED **[objects]** Shared list chrome with row actions; stop restating cards in prose
- ADDED Chat object rendering — objects/artifacts/MCP Apps in chat (phases A–D)
- ADDED **[objects]** Tasks/team/invoices widgets, entity_refs backfill
- ADDED **[mcp-apps]** Productionize widget host — bridge, CSP, template cache
- ADDED **[objects]** Pane object tabs, display-hint execution, mention chips
- ADDED **[objects]** Contacts + offers chat object widgets
- ADDED **[objects]** ObjectRef contract, object-widget registry, show_objects tool
- DOCS **[dev]** Document artifacts, objects, widgets and MCP Apps
- DOCS Chat object rendering design (objects, artifacts, MCP Apps in chat)
- FIXED **[ai]** Normalize guessed object ref types in show_objects
- FIXED **[ai-ui]** Render object cards outside the collapsed tool timeline

## [0.1.26] - 2026-07-16
- ADDED **[ai-ui]** User + binding columns in the activity table
- ADDED **[ai-ui]** Full list UI for the activity page
- ADDED **[ai-ui]** Full list UI for artifacts catalog
- ADDED **[ai-ui]** Group artifacts by scope + make them openable
- ADDED **[ai-ui]** Add Artifacts section to Engenty admin

## [0.1.25] - 2026-07-16
- FIXED **[offers]** Ignore settings autosave in external-change banner
- FIXED **[commercial-editor]** Default tax row 70/30 and phase index tooltip
- FIXED **[offers,commercial-editor]** Remove recipient card right padding gap
- FIXED **[ui-core]** Let doc sidebar grow within a capped document row

## [0.1.24] - 2026-07-16
- FIXED **[test]** Update gmail action expectations and hide collapsed flap content
- FIXED **[inbox]** Use interface for attachment fetch result type
- OTHER Improve inbox thread preview: layout, attachments, and list metadata.

Make message cards size to content with attachment thumbnails, fix recipient fallbacks, and surface status tags plus multi-message counts in the list.

Co-authored-by: Cursor <cursoragent@cursor.com>

## [0.1.23] - 2026-07-15
- ADDED **[tasks,ui-core]** Refine task detail workspace + doc-sidebar polish

## [0.1.22] - 2026-07-14
- ADDED **[offers,invoices]** Refine draft doc-sidebar layout
- ADDED **[invoices]** Move draft settings sheet to doc sidebar
- ADDED **[offers]** Move draft settings sheet to doc sidebar

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
