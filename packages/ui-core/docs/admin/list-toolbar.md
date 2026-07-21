---
title: Admin list toolbar
description: Pill search, view-mode toggle, icon buttons, segment toggles, and filter chips for admin list pages.
---

# Admin list toolbar

The row of controls above an [admin list](./list) — search, view switch, display
menu, filters — is built from a fixed set of pill-styled primitives so every
module list page (contacts, projects, files, …) looks and behaves the same.

Do **not** hand-roll a raw `<Input>` with an absolutely-positioned icon, a
labelled "Display" button, or a custom segmented control. Use these:

## Exports

| Export | Role |
|--------|------|
| `ListSearchInput` | Pill search field with a built-in magnifier; Mod+F focus; optional `onOpenFilters` for Mod+Shift+F |
| `useListToolbarHotkeys` | Hook behind `ListSearchInput` shortcuts (rarely needed directly) |
| `ListViewModeToggle` | Segmented list/cards switch — binds the same `ViewMode` as `ListDisplayConfigurator` |
| `ListToolbarIconButton` | Borderless icon button for permanent controls (display menu, filter). Always pass `aria-label` |
| `ListIconSegmentToggle` | Generic icon segmented control (e.g. contacts' organisation/person filter); `allowDeselect` for clearable |
| `ListFilterSelectTrigger` | Pill-styled `SelectTrigger` for inline filter dropdowns (e.g. a bucket/source picker) |
| `ListFilterChip` | Clearable dropdown chip with an active-state dot, for optional facet filters |

All export through `@engenty/ui-core` (source: `src/components/ui/list-toolbar.tsx`,
`src/components/admin/list-preferences/list-view-mode-toggle.tsx`).

## Canonical layout

Two responsive rows that stack on mobile and sit on one line on `md+`:
**left** = search + result count; **right** = view toggle + display menu
(replaced by bulk actions while a selection is active).

```tsx
import {
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListSearchInput,
  ListToolbarIconButton,
  ListViewModeToggle,
} from "@engenty/ui-core";
import { SlidersHorizontal } from "lucide-react";

<div className="flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center">
  {/* Left: search + count */}
  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
    <div className="w-full min-w-0 max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
      <ListSearchInput
        className="w-full"
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("toolbar.search")}
        value={search}
        wrapperClassName="w-full"
      />
    </div>
    <p className="min-w-0 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
      {t("toolbar.items", { count: total })}
    </p>
  </div>

  {/* Right: view toggle + display menu */}
  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:ml-auto md:shrink-0 md:justify-end">
    <ListViewModeToggle
      labels={{ table: t("display.tableView"), cards: t("display.cardsView") }}
      onChange={display.setViewMode}
      value={display.viewMode}
    />
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ListToolbarIconButton aria-label={t("display.display")} type="button">
          <SlidersHorizontal />
        </ListToolbarIconButton>
      </DropdownMenuTrigger>
      <ListDisplayConfigurator {/* …columns, sort, page size… */} />
    </DropdownMenu>
  </div>
</div>;
```

`ListViewModeToggle` and `ListDisplayConfigurator` must bind the **same**
`viewMode`/`setViewMode` from [`useListDisplayState`](./list-preferences) — the
toggle is the quick switch, the configurator the full menu.

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

```tsx
<ListSearchInput
  onChange={(e) => setSearch(e.target.value)}
  onOpenFilters={() => {
    if (!filtersExpanded) {
      setFiltersExpanded(true);
    }
  }}
  placeholder={t("toolbar.search")}
  value={search}
  wrapperClassName="w-full"
/>
```

## Notes

- The pill shadow uses `--shadow-ember-elevated` via a literal `[box-shadow:…]`;
  don't substitute `shadow-*` utilities (they resolve transparent for that token).
- Result count is a `text-xs tabular-nums` paragraph, not a heading.
- Optional filters: a `ListFilterSelectTrigger` inside a `Select` for a single
  inline picker, `ListIconSegmentToggle` for a small icon facet, or
  `ListToolbarIconButton` (filter icon) toggling a chip row of `ListFilterChip`s.

## Reference pages

- `modules/contacts/ui/components/contacts-list-toolbar.tsx` — adds an
  organisation/person `ListIconSegmentToggle`.
- `modules/projects/ui/components/projects-display-dialog.tsx` — adds a filter
  button + group-by in the configurator.
- `modules/files/ui/pages/files-list.tsx` — adds a `ListFilterSelectTrigger`
  bucket picker and a breadcrumb row above the toolbar.

## When not to use

- **Row rendering / pagination** — [admin list](./list).
- **The display menu itself** — [list preferences](./list-preferences)
  (`ListDisplayConfigurator`, `useListDisplayState`).
