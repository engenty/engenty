---
title: "@engenty/ui-core"
description: Shared UI primitives for apps, modules, and plugins — admin lists, settings forms, and shell layout.
---

# @engenty/ui-core

`@engenty/ui-core` is the shared React component library for Engenty. Apps (`apps/ui`), modules (`modules/*/ui`), and workspace packages import from here instead of duplicating shadcn-style primitives or shell chrome.

## Package layout

Source lives under `packages/ui-core/src/components/`:

| Area | Path | Purpose |
|------|------|---------|
| **shadcn primitives** | `ui/` | Radix/shadcn building blocks (Button, Dialog, Table, …). Managed with the shadcn CLI. |
| **Admin — list** | `admin/list/` | Table/cards list views, pagination, row selection, sortable headers. |
| **Admin — list preferences** | `admin/list-preferences/` | Display configurator and persisted list state (view mode, columns, sort). |
| **Admin — settings** | `admin/settings/` | Settings form sections, rows, and field grids. |
| **Layout — shell** | `layout/shell/` | Breadcrumbs, topbar actions, avatar stack, context pickers. |
| **Layout — sidebar** | `layout/sidebar/` | Module secondary nav rows, forest helpers, DnD insert bars. |

**Migration (2026-05-29, complete):** `copilot/` and `ai-elements/` live in `@engenty/ai-ui`. ui-core keeps only `ui/`, `admin/`, and `layout/`. **Do not** import `@engenty/ai-ui` from ui-core (Turbo build cycle). Module embeds use `@engenty/ai-ui/embed` for Tier 1. See [agent UI runtime](../../../docs/dev/agent-ui-runtime.md).

Public exports are re-exported from `packages/ui-core/src/index.ts`. After adding or moving components, run `pnpm --filter @engenty/ui-core build` and `pnpm check:ui-core-imports`.

## Import convention

```tsx
import {
  Button,
  SettingsFormSection,
  AdminListTableView,
  useListDisplayState,
  SidebarRow,
} from "@engenty/ui-core";
```

Copilot chrome and AI Elements import from `@engenty/ai-ui` — see [@engenty/ai-ui](../ai-ui/README). Product layout frame (`AppLayout`, secondary nav) lives in [@engenty/app-shell](../app-shell/README).

Module and plugin UI code must import shared UI from `@engenty/ui-core` only — not from `apps/ui/src/components/ui`.

## shadcn CLI

Install or update shadcn components from `packages/ui-core`:

```bash
cd packages/ui-core
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add dialog dropdown-menu tabs
```

Generated files land in `src/components/ui/`. Export new public components from `src/index.ts`. See [shadcn primitives](./shadcn-primitives) for aliases, CSS entry, and import rules.

## When to use which admin area

| Need | Use |
|------|-----|
| Render a data table or card grid with selection and pagination | [Admin list](./admin/list) |
| Let users toggle table/cards, compact rows, columns, and sort | [Admin list preferences](./admin/list-preferences) |
| Stacked settings blocks (title + description + form card) | [Admin settings](./admin/settings) |

## Layout

- **App shell breadcrumbs, topbar, module secondary nav** — [Layout](./layout)
- **Switch views inside a sidebar (tab strip)** — use `SidebarTabStrip` + `SidebarTab`; see the [sidebar-ui skill](../skills/sidebar-ui/SKILL.md#4-secondary-column-tab-strips)

## UI plugin registration

Routes and menu entries register through `@engenty/ui-plugin-sdk`, not ui-core:

```tsx
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";

export function registerMyModuleUi(engenty: EngentyPluginContext) {
  engenty.UI.registerRoute({
    id: "my_module_list",
    path: "/module/my-module",
    component: MyListPage,
  });
}
```

## Related docs

- Repo UI conventions: `docs/dev/ui-components.md` (when present) and `.cursor/rules/ui-components.mdc`
- Settings form spacing: `.cursor/rules/settings-form-section-ui.mdc`
- AI Elements install/usage: `.cursor/rules/ai-elements.mdc`
- Module list/detail/edit patterns: `.cursor/rules/list-detail-edit-ui-conventions.mdc`
