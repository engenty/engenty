---
title: Architecture
description: Package boundaries, Turbo import rules, and folder map for @engenty/app-shell.
---

# Architecture

`@engenty/app-shell` is the **browser shell frame** for Engenty product apps: layout chrome, navigation assembly from UI plugin contributions, copilot **slot** wiring (not copilot UI), and the React registry that feeds AG-UI `RunAgentInput` with UI state and frontend tools.

It is not a backend package and does not own AG-UI SSE transport or Mastra harness logic.

## Neighborhood

| Package / app | Role |
|---------------|------|
| **`packages/ui-core`** | Generic `ui/`, `admin/`, `layout/` — breadcrumbs, sidebar rows, buttons |
| **`packages/app-shell`** | `AppLayout`, nav builders, Agent UI registry, copilot layout constants (this package) |
| **`packages/ag-ui-bridge`** | Official AG-UI types, snapshot limits, frontend-tool metadata |
| **`packages/ai-ui`** | Copilot drawer/panel, AG-UI client, `buildAppsAiRunInput`, admin AI routes |
| **`packages/ui-plugin-sdk`** | `usePageHeader`, `registerAdminMenuItem`, route contributions |
| **`apps/ui`** | Auth bootstrap, mounts `AppLayout` + `EngentyAI` + drawer glue |

```text
apps/ui ──mounts──► AppLayout (app-shell)
                         │
                         ├──► ui-core primitives (topbar trail, sidebar rows in modules)
                         ├──► AgentUiStateProvider (snapshots + frontend tools)
                         └──► CopilotShellProvider (slot for ai-ui copilot chrome)
                                    │
                                    ▼
                              @engenty/ai-ui (drawer, AG-UI client)
                                    │
                                    ▼ fetch / SSE
                              apps/ai
```

## Import rules (avoid Turbo cycles)

| Rule | Detail |
|------|--------|
| app-shell → ui-core | **Allowed** — layout primitives and `cn` |
| app-shell → ag-ui-bridge | **Allowed** — types and tool helpers (re-exported on main entry) |
| app-shell → ai-ui | **Forbidden** — copilot layout constants live in `types/copilot-layout.ts` instead |
| ai-ui → app-shell | **Allowed** — layout constants, optional shell hooks |
| ui-core → app-shell | **Forbidden** |
| ui-core → ai-ui | **Forbidden** |

`COPILOT_BOTTOM_DOCK_HEIGHT`, `CopilotLayoutSnapshotV1`, and `CopilotLayoutPersistenceApi` intentionally live in app-shell so `AppLayout` can reserve bottom-dock space without importing ai-ui.

## What this package owns vs neighbors

| Concern | Owner |
|---------|--------|
| Primary sidebar rail, tenant switcher | `@engenty/app-shell` |
| Module secondary column frame + hover preview | `@engenty/app-shell` |
| Topbar integration with `usePageHeader` | `@engenty/app-shell` |
| `buildNavigationSections` from UI contributions | `@engenty/app-shell` (`/navigation` subpath) |
| Collect route/page/selection UI snapshots | `@engenty/app-shell` (`AgentUiStateProvider`) |
| Register browser frontend tools | `@engenty/app-shell` (`useFrontendTool`) |
| Official AG-UI wire types | `@engenty/ag-ui-bridge` |
| Merge snapshots + tools into `RunAgentInput` | `@engenty/ai-ui` |
| Copilot drawer, transcript, composer | `@engenty/ai-ui` |
| `ShellBreadcrumbTrail`, `SidebarRow` | `@engenty/ui-core` |

## Folder map

| Path | Notes |
|------|-------|
| `components/app-layout/` | Shell frame — `app-layout-frame`, secondary nav column, mobile sheet, layout hooks |
| `components/app-topbar.tsx` | Breadcrumbs, secondary-nav toggle, module root icon |
| `components/app-sidebar.tsx` | Primary rail + admin flyout |
| `components/sidebar-tenant-switcher.tsx` | Tenant dropdown in rail |
| `components/enrich-breadcrumb-nav-icon.tsx` | Map first breadcrumb segment to primary-nav icon |
| `context/copilot-shell-context.tsx` | Copilot slot + responsive dock mode hints |
| `context/agent-ui-state-context.tsx` | Snapshot + frontend-tool registry |
| `context/shell-secondary-nav-context.tsx` | Secondary column open state API for modules |
| `lib/navigation.ts` | Exported via `@engenty/app-shell/navigation` |
| `types/copilot-layout.ts` | Layout persistence types (no ai-ui) |
| `types/shell.ts` | `NavigationItem`, `ShellSidebarConfig`, tenants |

## Consumers

| Consumer | Typical imports |
|----------|-----------------|
| `apps/ui` | `AppLayout`, providers, `buildNavigationSections` via bootstrap |
| `apps/manage` | `AppLayout` (lighter shell) |
| `modules/*/ui` | `useCopilotShell`, `useRegisterAgentUiSlice`, `shellSecondaryNavItemProps`, `matchesPath` |
| `packages/ai-ui` | `COPILOT_BOTTOM_DOCK_HEIGHT`, layout snapshot types |

## Related docs

- [Shell layout](./shell-layout)
- [Navigation](./navigation)
- [Agent UI registration](./agent-ui-registration)
- [Agent UI runtime](../../../docs/dev/agent-ui-runtime.md)
- [@engenty/ui-core layout](../ui-core/layout)
- [@engenty/ai-ui architecture](../ai-ui/architecture)
