---
name: sidebar-ui
description: Spacing, alignments, sub-component structure, and semantic markup conventions for building secondary-column navigation sidebars.
---

# Sidebar UI Spacing and Layout Conventions

This skill provides step-by-step instructions, visual rules, and coding patterns for building secondary navigation sidebar panels within monorepo modules.

---

## 1. Grid & Alignment Tokens

All secondary sidebar layouts are aligned to a strict horizontal padding system:

- **Parent Gutter**: `sidebarColumnGutterClassName` (`px-2` = 8px) — Applied to the parent column shell wrapper.
- **Content Inset**: `sidebarColumnContentInsetClassName` (`pl-2` = 8px) — Stacks on top of the gutter to hit a **16px** alignment grid.
- **Clearance Inset**: `sidebarColumnContentInsetEndClassName` (`pr-1` = 4px) — Right inset to clear the resize handle.

| Element | Desired Offset | Layout Structure |
|---|---|---|
| Search Input Border | **16px** | Wrapper has `pl-2 pr-1`, input has `w-full` |
| Navigation Row Hover State | **8px** | Navigation lists have **no** `pl-2` wrapper |
| Navigation Icons | **16px** | `SidebarRow` automatically adds `paddingLeft: 8px` |
| Iconless Text Leaf Items | **16px** | `SidebarRow` automatically adds `paddingLeft: 8px` |

---

## 2. Component Refactoring & Separation

Secondary sidebar panels must not contain raw inline menus or dialog elements. They should be split into:

1. **Lightweight Orchestrator** (`*sidebar-panel.tsx`):
   - Manages state, hooks, preferences, queries, and modal open states.
   - Delegates rendering to the sub-components.
   - Root wrapper is a column flexbox: `className="flex min-h-0 flex-1 flex-col overflow-hidden"`.
2. **Sub-Components** (placed under the sibling `components/` directory):
   - `*sidebar-header.tsx`: Renders search row + top nav links.
   - `*sidebar-list.tsx`: Renders skeletons, list items, and group headers.
   - `*sidebar-footer.tsx`: Renders settings link pinned to the bottom.
   - `*sidebar-delete-dialog.tsx`: Renders confirmation alert dialogs.

---

## 3. Implementation Code Patterns

### Header Component (`*sidebar-header.tsx`)
Avoid wrapping `SidebarNavList` in unnecessary `<nav>` tags. Set `className="pt-2"` on `SidebarNavList` directly to separate it from the search container.

```tsx
export function ProjectsSidebarHeader({ search, onSearchChange, pathname }) {
  return (
    <SidebarHeader className="gap-0 p-0 pb-3">
      {/* Search Input wrapper gets pl-2 pr-1 */}
      <div className="flex min-w-0 items-center gap-1 pl-2 pr-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            className="h-8 w-full py-0 pr-7 pl-8 text-sm"
            onChange={(e) => onSearchChange(e.target.value)}
            value={search}
          />
        </div>
      </div>

      {/* Nav List is mounted directly without nav tags */}
      <SidebarNavList className="pt-2">
        <SidebarNavRow
          active={pathname === "/mdl/projects"}
          icon={DockProjectsIcon}
          label="Projects"
          to="/mdl/projects"
        />
      </SidebarNavList>
    </SidebarHeader>
  );
}
```

### List Component (`*sidebar-list.tsx`)
Do **not** wrap lists in containers that apply `pl-2`. `SidebarRow` provides the required depth-based indentation inline. Adding padding to the wrapper double-indents items.

```tsx
export function ProjectsSidebarGroupedList({ groups, renderItem }) {
  return (
    <SidebarNavList>
      {groups.map((group) => (
        <div className="contents" key={group.key}>
          {group.label ? (
            <SidebarNavSectionLabel>
              {group.label} ({group.projects.length})
            </SidebarNavSectionLabel>
          ) : null}
          {group.projects.map((item) => renderItem(item))}
        </div>
      ))}
    </SidebarNavList>
  );
}
```

### Footer Component (`*sidebar-footer.tsx`)
Settings and bottom navigation links are pinned to the bottom of the column:
- Wrapper `div` uses `shrink-0 border-border-soft border-t pt-2 pr-1 pb-2` (no `pl-2`).
- No wrapping `<nav>` tags.

```tsx
export function ProjectsSidebarFooter({ pathname }) {
  return (
    <div className="shrink-0 border-border-soft border-t pt-2 pr-1 pb-2">
      <SidebarNavList>
        <SidebarNavRow
          active={pathname === "/mdl/projects/settings"}
          icon={Settings}
          label="Settings"
          to="/mdl/projects/settings"
        />
      </SidebarNavList>
    </div>
  );
}
```

---

## 4. Secondary-Column Tab Strips

When a sidebar needs to switch between views (e.g. **Agents · Sessions · Skills**, **Tasks · Goals · Routines**, **Articles · FAQs · Chat · ★**), use the **`SidebarTabStrip`** + **`SidebarTab`** components from `@engenty/ui-core`. This is the single engenty-wide standard — do **not** hand-roll the strip with raw Tailwind, and do **not** reach for `Tabs`/`TabsList`/`TabsTrigger` or class-name constants here. One component guarantees every sidebar looks identical.

```tsx
import { SidebarTab, SidebarTabStrip } from "@engenty/ui-core";

<SidebarTabStrip onValueChange={(v) => setTab(v as MyTab)} value={tab}>
  <SidebarTab value="agents">{t("agents")}</SidebarTab>
  <SidebarTab value="sessions">{t("sessions")}</SidebarTab>
  <SidebarTab value="skills">{t("skills")}</SidebarTab>
</SidebarTabStrip>
```

Rules:
- **Layout is automatic.** Text tabs share the width equally; you never pass column counts or grid templates. The strip already applies the column inset (`pt-2 pl-2 pr-1`), so mount it as a direct child of `SidebarHeader` — do not wrap it in your own spacing `div`.
- **Icon-only tabs** get a fixed-width slot via the `icon` prop. Always pass an `aria-label` (and usually `title`):
  ```tsx
  <SidebarTab aria-label={t("favorites")} icon title={t("favorites")} value="favorites">
    <Star aria-hidden className="size-3.5" />
  </SidebarTab>
  ```
- `SidebarTab` forwards all `TabsTrigger` props (`value`, `disabled`, `aria-*`, …). Only add `className` for a genuine one-off; if you find yourself styling it repeatedly, the component should change instead.

---

## 5. Verification Check

To test alignment in the browser:
1. Rebuild the module using `pnpm --filter @engenty/<module-name> build`.
2. Inspect the elements in browser devtools:
   - Ensure the search wrapper left padding matches `pl-2` (visual 16px start).
   - Ensure row hover boxes start at 8px from the column edge.
   - Verify that row icons and iconless text leaves align perfectly on the same vertical line at 16px.
