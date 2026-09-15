---
title: Admin list toolbar
description: Compound ListToolbar shell plus pill search, view-mode toggle, and filter chips for admin list pages.
---

# Admin list toolbar

The row of controls above an [admin list](./list) — search, view switch, display
menu, filters — uses a **compound `ListToolbar` shell** so every module list page
shares the same responsive layout, spacing, and selection swap.

Do **not** hand-roll the outer `flex-col md:flex-row` shell, a raw `<Input>` with
an absolutely-positioned icon, a labelled "Display" button, or a custom
segmented control. Do **not** pass ReactNode slot props (`search={…}`,
`controls={…}`). Compose with children.

## Compound shell

| Export | Role |
|--------|------|
| `ListToolbar` | Root — responsive layout; `selectedCount` drives selection mode |
| `ListToolbarMainArea` | Left cluster (search + summary + optional extras) |
| `ListToolbarSearch` | Search width clamp; wrap `ListSearchInput` + optional trailing control |
| `ListToolbarFilterToggle` | In-search filter icon + active dot |
| `ListToolbarSummary` | `text-xs tabular-nums` result count |
| `ListToolbarActions` | Right cluster; idle ↔ bulk swap; overflow "more" |
| `ListToolbarIdleControls` | View toggle + display (shown when nothing selected) |
| `ListToolbarOverflowItem` | Marks children that move into the selection overflow menu |
| `ListToolbarBulkActions` | Bulk buttons + clear (shown when `selectedCount > 0`) |
| `ListToolbarFilterRow` | Optional second row for filter chips |
| `useListToolbar` | `{ selectedCount, hasSelection, overflowPlacement }` |

## Pill primitives

| Export | Role |
|--------|------|
| `ListSearchInput` | Pill search field with magnifier; Mod+F; optional `onOpenFilters` |
| `useListToolbarHotkeys` | Hook behind shortcuts (rarely needed directly) |
| `ListViewModeToggle` | Table/cards switch — same `ViewMode` as `ListDisplayConfigurator` |
| `ListToolbarIconButton` | Borderless icon button (display menu). Always pass `aria-label` |
| `ListIconSegmentToggle` | Icon segment control (e.g. organisation/person); `allowDeselect` |
| `ListFilterSelectTrigger` | Pill `SelectTrigger` for inline filter dropdowns |
| `ListFilterChip` | Clearable dropdown chip for facet filters |

All export through `@engenty/ui-core` (source: `list-toolbar-shell.tsx`,
`list-toolbar.tsx`, `list-view-mode-toggle.tsx`).

## Canonical layout

```tsx
import {
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
  ListToolbarBulkActions,
  ListToolbarFilterRow,
  ListToolbarFilterToggle,
  ListToolbarIdleControls,
  ListToolbarIconButton,
  ListToolbarMainArea,
  ListToolbarOverflowItem,
  ListToolbarSearch,
  ListToolbarSummary,
  ListViewModeToggle,
  useListToolbar,
} from "@engenty/ui-core";
import { SlidersHorizontal } from "lucide-react";

function DisplayMenu() {
  const { overflowPlacement } = useListToolbar();
  const inMenu = overflowPlacement === "menu";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {inMenu ? (
          <Button
            aria-label={t("display.display")}
            className="h-9 w-full justify-start gap-1.5"
            size="sm"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t("display.display")}
          </Button>
        ) : (
          <ListToolbarIconButton aria-label={t("display.display")} type="button">
            <SlidersHorizontal />
          </ListToolbarIconButton>
        )}
      </DropdownMenuTrigger>
      <ListDisplayConfigurator {/* … */} />
    </DropdownMenu>
  );
}

<ListToolbar selectedCount={selectedCount}>
  <ListToolbarMainArea>
    <ListToolbarSearch>
      <ListSearchInput
        className="w-full pr-10"
        onChange={(e) => setSearch(e.target.value)}
        onOpenFilters={() => {
          if (!filtersExpanded) setFiltersExpanded(true);
        }}
        placeholder={t("toolbar.search")}
        value={search}
        wrapperClassName="w-full"
      />
      <ListToolbarFilterToggle
        active={filtersExpanded || hasActiveFilters}
        aria-label={t("toolbar.filters")}
        aria-pressed={filtersExpanded}
        onClick={onFiltersToggle}
        showDot={hasActiveFilters}
      />
    </ListToolbarSearch>
    <ListToolbarSummary>
      {selectedCount > 0
        ? t("toolbar.selected", { count: selectedCount })
        : t("toolbar.items", { count: total })}
    </ListToolbarSummary>
  </ListToolbarMainArea>

  <ListToolbarActions moreLabel={t("toolbar.more")}>
    <ListToolbarIdleControls>
      <ListViewModeToggle
        labels={{ table: t("display.tableView"), cards: t("display.cardsView") }}
        onChange={display.setViewMode}
        value={display.viewMode}
      />
      <ListToolbarOverflowItem>
        <DisplayMenu />
      </ListToolbarOverflowItem>
    </ListToolbarIdleControls>
    <ListToolbarBulkActions
      clearSelectionLabel={t("toolbar.clearSelection")}
      onClearSelection={clearSelection}
    >
      {/* bulk buttons */}
    </ListToolbarBulkActions>
  </ListToolbarActions>

  {filtersExpanded ? (
    <ListToolbarFilterRow>{/* ListFilterChip… */}</ListToolbarFilterRow>
  ) : null}
</ListToolbar>;
```

`ListViewModeToggle` and `ListDisplayConfigurator` must bind the **same**
`viewMode`/`setViewMode` from [`useListDisplayState`](./list-preferences).

When rows are selected, idle controls hide; bulk actions show; children inside
`ListToolbarOverflowItem` move into the overflow "more" menu (with
`overflowPlacement === "menu"`).

## Keyboard shortcuts

`ListSearchInput` registers list-scoped shortcuts (via `useListToolbarHotkeys`):

| Shortcut | Action |
|----------|--------|
| Mod+F (Cmd/Ctrl+F) | Focus and select the list search field |
| Mod+Shift+F | Open the filter chip bar — only when `onOpenFilters` is passed |
| Mod+N | Open the new-item dialog — call `useListToolbarHotkeys({ onNewItem })` on the page |

Pass `onOpenFilters` from toolbars that own an expandable filter row (ensure
open, do not toggle closed). Wire `onNewItem` from the list page when a create
dialog exists. Shortcuts are ignored while focus is inside a dialog/sheet. Set
`enableHotkeys={false}` on `ListSearchInput` to opt out of Mod+F / Mod+Shift+F.

## Notes

- The pill shadow uses `--shadow-ember-elevated` via a literal `[box-shadow:…]`;
  don't substitute `shadow-*` utilities (they resolve transparent for that token).
- Result count goes in `ListToolbarSummary`, not a heading.
- Optional filters: `ListToolbarFilterToggle` + `ListToolbarFilterRow` of
  `ListFilterChip`s, or `ListIconSegmentToggle` / `ListFilterSelectTrigger` as
  children of `ListToolbarMainArea`.
- `ListFilterChip` is single-select by default. Pass `multiple` with `values` /
  `onValuesChange` for OR'd checkbox facets (provider, tags, and similar).

## Reference pages

- `modules/contacts/ui/components/contacts-display-dialog.tsx` — type segment + selection.
- `modules/projects/ui/components/projects-display-dialog.tsx` — filter toggle + group-by.
- `modules/files/ui/pages/files-list.tsx` — bucket picker above/beside the toolbar.

## When not to use

- **Row rendering / pagination** — [admin list](./list).
- **The display menu itself** — [list preferences](./list-preferences)
  (`ListDisplayConfigurator`, `useListDisplayState`).
