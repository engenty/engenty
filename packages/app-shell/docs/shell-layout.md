---
title: Shell layout
description: AppLayout frame, primary rail, module secondary column, topbar, and copilot slots.
---

# Shell layout

The product shell is composed from **`AppLayout`** (frame), **`AppSidebar`** (primary rail), **`AppTopbar`** (breadcrumbs and toggles), and **`CopilotShellProvider`** (slot for `@engenty/ai-ui` copilot chrome).

Implementation lives under `src/components/app-layout/` — `app-layout-frame.tsx`
orchestrates layout; the docked app bar lives in `app-bar-rail.tsx` (spacer,
hover strip, hide animation) with `app-bar-context-menu.tsx` for pin/hide and
position. Secondary nav UI, mobile sheet, and resize/hover hooks are split into
focused modules (kebab-case filenames).

Module pages render **inside** the frame via React Router. They configure chrome through `@engenty/ui-plugin-sdk` (`usePageConfig` / `usePageHeader`), not by forking layout markup.

## Column model

The **app bar** (`AppSidebar`) docks on an edge. Everything else — secondary
sidebar, main, end-pane, copilot — stays in one **ContentWrap** whose inner
`flex-row` does not change with the edge.

```text
ContentWrap = [Sidebar] [Main] [Copilot]

Left (default)     [AppBar] [ContentWrap]
Right              [ContentWrap] [AppBar]
Top                [AppBar]
                   [ContentWrap]
Bottom             [ContentWrap]
                   [AppBar]
```

```text
┌──────────┬────────────────────┬─────────────────────────────┐
│ App bar  │ Secondary (module) │ Main + optional copilot col │
│ (left)   │ nav (optional)     │                             │
│ AppSidebar│ pinned or hover   │ CopilotShellMain + children │
└──────────┴────────────────────┴─────────────────────────────┘
```

`.shell-root` is `flex-row` for left/right and `flex-col` for top/bottom (with
`-reverse` when the bar is on the end edge). `data-app-bar-position` on
`.shell-root` is enough for leftover CSS. Mobile (`< md`) still uses the left
sheet; position is desktop-only.

| Column | Component | When visible |
|--------|-----------|--------------|
| App bar | `AppSidebar` in `AppBarRail` | Desktop on the chosen edge (56px compact; 220px extended on left/right only). Top is a 56px icon strip — brand + spaces at the start, modules flex-1, admin / bell / avatar / **Copilot blob** at the end. Bottom reverses that strip (blob + avatar left, spaces + brand right). The blob is slightly larger than the rail and overlaps the canvas. |
| Secondary | `AppLayout` inner panel | Module registers secondary nav items via page header |
| Main | `CopilotShellMain` | Route outlet |
| Copilot | Host-injected slot | `shellUiHost` / copilot provider children |

**App bar position** — user-settings JSON `shell.app_bar.position`
(`{ v: 1, position: "left"|"top"|"right"|"bottom" }`), injected via `AppLayout`
`appBarPositionPersistence`. Instant paint uses `localStorage` key
`engenty:app-bar-position` and event `engenty:app-bar-position-change`. Right-click
the rail for Pin / Hide and a **Position on screen** submenu; Profile → Appearance
has the same four-edge control (saves immediately). Auto-hide slides the bar off
its edge and lets ContentWrap fill the space.


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
