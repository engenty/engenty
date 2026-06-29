---
title: List preferences
description: useListDisplayState and ListDisplayConfigurator for table/cards, columns, compact mode, and sort.
---

# List preferences

`admin/list-preferences/` owns **how** a list is displayed: table vs cards, compact rows, visible columns, column order, and sort field/order. Data fetching and pagination stay in the page; this area only handles display preference state and the configurator UI.

## Exports

| Export | Role |
|--------|------|
| `useListDisplayState` | Hook with localStorage/sessionStorage persistence per `storageKey` |
| `ListDisplayConfigurator` | Dropdown panel for view mode, compact toggle, columns, and sort |
| `ColumnConfig`, `ViewMode`, `TableSize`, `SortOrder` | Types for column metadata and display modes |

Preferences persist under `engenty.list-display.<storageKey>` when using the default localStorage backend.

## Step 1 — State on the list page

```tsx
import { useListDisplayState, type ViewMode } from "@engenty/ui-core";

export type MyColumnVisibility = {
  name: boolean;
  email: boolean;
  createdAt: boolean;
};

const DEFAULTS = {
  viewMode: "table" as ViewMode,
  tableSize: "compact" as const,
  sortBy: "name" as "name" | "created_at",
  sortOrder: "asc" as const,
  columnVisibility: { name: true, email: true, createdAt: true },
  columnOrder: ["name", "email", "createdAt"] as (keyof MyColumnVisibility)[],
};

const display = useListDisplayState<keyof MyColumnVisibility, "name" | "created_at">({
  storageKey: "my-module",
  defaults: DEFAULTS,
  validSortColumns: ["name", "created_at"],
  options: { storage: "localStorage" },
});
```

Use `options: { storage: "sessionStorage" }` when preferences should not survive a full reload.

## Step 2 — Toolbar with configurator

Mount `ListDisplayConfigurator` inside a `DropdownMenu` in the list toolbar (alongside search). Pass display state setters from the hook:

```tsx
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  type ColumnConfig,
} from "@engenty/ui-core";

const columnConfigs: ColumnConfig<keyof MyColumnVisibility>[] = [
  { id: "name", label: t("columns.name"), icon: User },
  { id: "email", label: t("columns.email"), icon: Mail },
  { id: "createdAt", label: t("columns.createdAt"), icon: Calendar },
];

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm">
      <SlidersHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <ListDisplayConfigurator
    viewMode={display.viewMode}
    onViewModeChange={display.setViewMode}
    tableSize={display.tableSize}
    onTableSizeChange={display.setTableSize}
    sortBy={display.sortBy}
    sortOrder={display.sortOrder}
    onSortByChange={display.setSortBy}
    onSortOrderChange={display.setSortOrder}
    sortOptions={[
      { value: "name", label: t("columns.name") },
      { value: "created_at", label: t("columns.createdAt") },
    ]}
    columnVisibility={display.columnVisibility}
    columnOrder={display.columnOrder}
    onColumnVisibilityChange={display.setColumnVisibility}
    onColumnOrderChange={display.setColumnOrder}
    columns={columnConfigs}
  />
</DropdownMenu>
```

## Step 3 — Wire the list view

Derive visible columns from `display.columnVisibility` and `display.columnOrder`, then pass `display.viewMode`, `display.tableSize`, `display.sortBy`, and `display.sortOrder` to [Admin list](./list) components.

## Conventions

- **Sorting belongs in Display** — do not add separate sort selects in the toolbar; `ListDisplayConfigurator` includes sort field and order.
- **Create dialog** — keep list pages list-first; use `usePageConfig` topbar actions to open a create `Dialog` with mandatory fields only.
- **i18n** — module locale files need strings for configurator labels (`tableView`, `cardsView`, `compactView`, `sortBy`, column show/hide labels, pagination summary, etc.).

## Source

`packages/ui-core/src/components/admin/list-preferences/`
