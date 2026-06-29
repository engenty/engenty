---
title: Admin components
description: Choose between admin list, list preferences, and settings form building blocks.
---

# Admin components

The `admin/` tree covers three related but distinct list and settings surfaces. Pick the smallest set that matches the page.

## Decision guide

| Goal | Component area | Key exports |
|------|----------------|-------------|
| Render rows in a table or card grid with bulk selection and pagination | [List](./list) | `AdminListTableView`, `AdminListCardsView`, `AdminListPagination`, `TableSelectionCell`, `TableSortableHeader` |
| Build the controls row above a list (search, view switch, filters) | [List toolbar](./list-toolbar) | `ListSearchInput`, `ListViewModeToggle`, `ListToolbarIconButton`, `ListIconSegmentToggle`, `ListFilterChip` |
| Persist view mode, column visibility/order, compact rows, and sort | [List preferences](./list-preferences) | `useListDisplayState`, `ListDisplayConfigurator` |
| Stacked settings sections with title, description, and form card | [Settings](./settings) | `SettingsFormSection`, `SettingsFormRow`, `SettingsFormCard` |

Typical module list page wiring:

1. **`useListDisplayState`** — persisted display preferences (localStorage by default).
2. **[Toolbar](./list-toolbar)** — `ListSearchInput` + `ListViewModeToggle` + `ListDisplayConfigurator` in a dropdown.
3. **`AdminListTableView` or `AdminListCardsView`** — renders rows from your data hook.
4. **`AdminListPagination`** — page controls when the API is paginated.

Settings and tenant admin pages use **`SettingsFormSection`** instead of hand-rolled title/description/card stacks.

## Source paths

```
packages/ui-core/src/components/admin/
  list/                 # table/cards/pagination/selection
  list-preferences/     # configurator + useListDisplayState
  settings/             # SettingsFormSection, SettingsFormRow, …
```

All public symbols export through `@engenty/ui-core` (see `src/components/admin/index.ts`).

## Module conventions

- List filters stay in the list toolbar, not the global topbar.
- Create actions belong in topbar `usePageConfig` actions and open a dialog on the list page — not inline create forms in the list body.
- Edit screens use dedicated routes (`/module/<name>/:id/edit`), not query-param edit mode.
- See `.cursor/rules/list-detail-edit-ui-conventions.mdc` for full module page patterns.
