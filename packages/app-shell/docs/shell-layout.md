---
title: Shell layout
description: AppLayout frame, primary rail, module secondary column, topbar, and copilot slots.
---

# Shell layout

The product shell is composed from **`AppLayout`** (frame), **`AppSidebar`** (primary rail), **`AppTopbar`** (breadcrumbs and toggles), and **`CopilotShellProvider`** (slot for `@engenty/ai-ui` copilot chrome).

Implementation lives under `src/components/app-layout/` — `app-layout-frame.tsx` orchestrates layout; secondary nav UI, mobile sheet, and resize/hover hooks are split into focused modules (kebab-case filenames).

Module pages render **inside** the frame via React Router. They configure chrome through `@engenty/ui-plugin-sdk` (`usePageConfig` / `usePageHeader`), not by forking layout markup.

## Column model

```text
┌──────────┬────────────────────┬─────────────────────────────┐
│ Primary  │ Secondary (module) │ Main + optional copilot col │
│ rail     │ nav (optional)     │                             │
│ AppSidebar│ pinned or hover   │ CopilotShellMain + children │
└──────────┴────────────────────┴─────────────────────────────┘
```

| Column | Component | When visible |
|--------|-----------|--------------|
| Primary rail | `AppSidebar` | Desktop always; mobile via sheet |
| Secondary | `AppLayout` inner panel | Module registers secondary nav items via page header |
| Main | `CopilotShellMain` | Route outlet |
| Copilot | Host-injected slot | `shellUiHost` / copilot provider children |

## Page header integration

Modules set shell chrome with **`usePageConfig`**:

| Field | Effect |
|-------|--------|
| `breadcrumbs` | Topbar trail (`ShellBreadcrumbTrail` from ui-core) |
| `topbarChrome: "contentBlend"` | Slim topbar aligned with secondary column header |
| `secondaryNavHeaderSlot` | Module chrome (KB switcher, contacts search) — **not** `secondaryNavBeforeItems` |
| `secondaryNavAfterItems` | Custom panel below role links (chat session list, KB tree) |
| `secondaryNavSearchResultsOnly` | Hide shell-managed role links; keep `afterItems` |

When the secondary column is **pinned open** and breadcrumbs are empty, the module title often lives in `secondaryNavHeaderSlot`; the **module root icon** renders in the main topbar (left cluster). See `enrich-breadcrumb-nav-icon` and `AppTopbar`.

## Secondary nav behavior

- **Pinned open** — inline column animates width (`transition-[width]`, inner `min-w-*` matches natural width).
- **Closed** — hover preview overlay slides with `translateX` + 150 ms close debounce; toggle in topbar wires `onSecondaryNavHoverEnter` / `Leave`.
- **&lt; 1025 px** — pinned column forced closed (hover preview still available from 768px via `md:flex`); user `pinnedOpen` preference applies from 1025px up.
- **&lt; 768 px (`md`)** — inline column hidden; primary + module nav use the burger sheet (`md:hidden`).
- **Pinned preference** — user-settings JSON `shell.secondary_nav.pinned` (`pinnedOpen` boolean), injected via `AppLayout` `secondaryNavPersistence` (host app). Width still uses `localStorage` key `engenty.shell_secondary_nav.width_px`.

Full animation checklist: `.cursor/rules/app-shell-sidebar-animation.mdc`.

## Keyboard

Secondary nav list items should spread **`shellSecondaryNavItemProps`** (data attribute + roving tabindex) so Arrow Up/Down move focus inside the panel. Export: `@engenty/app-shell`.

## Copilot shell

`CopilotShellProvider` wraps the layout tree and exposes:

- `useCopilotShell` / `useCopilotShellOrNull` — dock mode hints, content area refs
- `CopilotShellMain` / `CopilotShellContentArea` — layout regions for ai-ui drawer

Responsive dock mode (sidebar vs bottom vs floating) is derived from internal media queries; persisted layout snapshots use types from `types/copilot-layout.ts` and are applied by **`@engenty/ai-ui`** + user settings — not inside `AppLayout` directly.

## Persisted widths

| Hook / constant | Use |
|-----------------|-----|
| `useShellSecondaryNavWidth` | Module secondary column resize |
| `usePersistedEwResizePaneWidth` | Generic east–west pane (module hooks wrap with module storage keys) |

Module-specific keys (e.g. inbox metadata sidebar) live in **`modules/<name>/ui/hooks/`**, not in app-shell.

## Print styles

`src/styles/engenty-print.css` is imported from app `index.css` (`apps/ui`, `apps/manage`). Keep print rules here rather than duplicating per app.

## ui-core primitives in modules

Secondary nav **content** should compose ui-core sidebar primitives (`SidebarRow`, forest helpers) inside `secondaryNavAfterItems`. The **frame** (width animation, hover overlay, topbar toggle) stays in app-shell.

## Related docs

- [Architecture](./architecture)
- [@engenty/ui-core layout](../ui-core/layout)
- [@engenty/ai-ui copilot](../ai-ui/copilot)
- Module list/detail/edit: `.cursor/rules/list-detail-edit-ui-conventions.mdc`
