---
title: Layout
description: Shell breadcrumbs, topbar actions, and sidebar row primitives for module secondary nav.
---

# Layout

`layout/` splits app chrome into **shell** (topbar and breadcrumbs) and **sidebar** (module secondary navigation rows and tree helpers).

## Shell (`layout/shell/`)

| Export | Role |
|--------|------|
| `ShellBreadcrumbTrail` | Responsive breadcrumb trail with compact collapse |
| `ShellBreadcrumbPlainText` | Non-link breadcrumb segments |
| `BreadcrumbContextPicker` | Popover picker for context switches (e.g. KB/workspace) |
| `ContextPopoverList` | Structured sections for context popover content |
| `TopbarActionLabel` / `topbarIconButtonClassName` | Topbar action button styling |
| `AvatarStack` | Overlapping avatar group for collaborators |

Breadcrumb items accept a render-link callback so apps can wire React Router (or another router) without ui-core taking a router dependency.

## Sidebar (`layout/sidebar/`)

Module secondary nav should compose these primitives instead of ad-hoc row markup:

| Export | Role |
|--------|------|
| `SidebarRow`, `SidebarRowButton` | Base row shell and interactive row |
| `SidebarRowLeadingIcon` | Folder/collection icon with hover chevron swap |
| `SidebarRowActions` | Hover-revealed overflow actions |
| `SidebarExpandChevronButton` | Expand/collapse for tree rows |
| `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, … | shadcn sidebar menu building blocks |
| `SidebarListInsertDropBar` | DnD insert indicator between rows |
| Forest helpers | `capSidebarForest`, `filterSidebarForest`, `computeSidebarListInsertPlace`, `attachSidebarListInsertDropHandlers` |

Dense-menu class name exports (`sidebarDenseMenu*`, `sidebarRowPaddingLeftPx`, indent constants) keep KB-like trees aligned with design tokens.

## App shell integration

Frame behavior (`AppLayout`, secondary column, hover preview) lives in [@engenty/app-shell](../app-shell/shell-layout). This package supplies the **primitives** modules compose inside that frame.

- Module chrome (KB switcher, contacts search, etc.) belongs in the app shell **secondary column header** slot with `topbarChrome: "contentBlend"` — not mixed into unrelated topbar actions.
- Active sidebar items use **bold text**, not accent fills.
- Prefer default/normal button size (`text-sm`) for module trees unless a surface is explicitly compact.

## When not to use

- **Data tables and admin lists** — [Admin list](../admin/list)
- **Copilot drawer/panel** — [@engenty/ai-ui copilot docs](../../ai-ui/copilot)
- **Raw shadcn `Button`/`DropdownMenu`** — [shadcn primitives](../shadcn-primitives) unless layout-specific wrappers are unnecessary

## Source

```
packages/ui-core/src/components/layout/
  shell/
  sidebar/
```

Public re-exports: `packages/ui-core/src/components/layout/index.ts`
