---
title: Admin list
description: AdminListTableView, AdminListCardsView, pagination, selection, and sortable headers.
---

# Admin list

`admin/list/` provides opinionated list rendering for module and admin pages: table and card layouts, sticky selection columns, row actions, and pagination chrome.

## Exports

| Export | Role |
|--------|------|
| `AdminListTableView` | Column-driven table with optional compact row density |
| `AdminListCardsView` | Responsive card grid for the same row model |
| `AdminListPagination` | Page size and navigation controls |
| `TableSelectionCell` / `TableSelectionHeader` | Bulk-select checkbox column (sticky class helpers exported) |
| `TableSortableHeader` | Header cell with sort affordance |
| `TableRowActions` | Overflow menu slot for row-level actions |

Sticky header/checkbox class constants (`STICKY_HEADER_CLASS`, `STICKY_CHECKBOX_*`) keep selection columns aligned during horizontal scroll.

## Typical usage

Pair list views with [list preferences](./list-preferences) state:

```tsx
import {
  AdminListTableView,
  AdminListPagination,
  useListDisplayState,
} from "@engenty/ui-core";

const display = useListDisplayState({
  storageKey: "contacts",
  defaults: { viewMode: "table", tableSize: "compact", /* … */ },
  validSortColumns: ["name", "created_at"],
});

return (
  <>
    <AdminListTableView
      rows={rows}
      columns={visibleColumns}
      tableSize={display.tableSize}
      sortBy={display.sortBy}
      sortOrder={display.sortOrder}
    />
    <AdminListPagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
  </>
);
```

Switch on `display.viewMode` to render `AdminListCardsView` instead when the user picks cards view.

## Card grid layout

`AdminListCardsView` renders a scroll area only — **no outer elevated list shell**. Individual items in the grid should be elevated cards (`.ui-canvas-raised` or `bg-card` with canvas shadow tokens) sitting directly on the page canvas.

Pair with `adminListCardsGridClassName(tableSize)` for the responsive grid. Use `AdminListTableView` with `transparent` when the table view should also skip the outer shell.

## When not to use

- **Display toggles and column picker** — use `ListDisplayConfigurator` from [list preferences](./list-preferences), not ad-hoc toolbar controls.
- **Settings-style labeled rows** — use [settings](./settings) (`SettingsFormSection` / `SettingsFormRow`).
- **Module secondary nav trees** — use [layout sidebar](../layout) (`SidebarRow`, `SidebarRowButton`, forest helpers).

## Source

`packages/ui-core/src/components/admin/list/`
