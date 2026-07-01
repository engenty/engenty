# Engenty Design System

Living reference for visual patterns, tokens, and component rules.
Update whenever a new pattern is established or an existing one is revised.

**Agent priority:** This file is the **canonical** source for visual UI (tokens, typography, spacing, shell, tables, forms, elevation). It outranks shadcn defaults, ad-hoc Tailwind, and `docs/agent/rules/*` when they conflict on look-and-feel. Flow rules (routes, breadcrumbs, display dialog) live in `docs/agent/rules/*-ui*.mdc` and must still conform to patterns here.

### Sources of truth (code)

- **Primitives & type scale:** `packages/design-tokens/src/ember-primitives.css` (`--paper`, `--ember`, shadows, `--t-*`, `--r-*`, etc.).
- **shadcn semantic mapping (light/dark):** `packages/design-tokens/src/shadcn-ember.css` (`--background` → canvas, `--card`, `--sidebar`, `--muted`, …).
- **List / toolbar / table chrome:** `packages/design-tokens/src/ui-canvas-chrome.css` (CSS variables + `.ui-canvas-*` utilities).
- **Apps** import the chain from `apps/ui/src/index.css` (`shadcn-ember.css` then `ui-canvas-chrome.css`).

---

## Surfaces & Background Tokens

| Token | OKLCH | Use |
|---|---|---|
| `--canvas` | alias of `--paper` | shadcn `--background` in light mode |
| `--paper` | `oklch(98.4% 0.006 70)` | Primary page canvas — warm near-white |
| `--paper-2` | `oklch(96.6% 0.01 70)` | Sunken / dimmed canvas |
| `--paper-3` | `oklch(94.2% 0.014 70)` | Deeper sunken |
| `--card` | `oklch(100% 0 0)` | White card surface (pure white) |
| `--ink` | `oklch(22% 0.018 60)` | Primary text |
| `--ink-2` | `oklch(40% 0.014 60)` | Secondary text |
| `--ink-3` | `oklch(55% 0.012 60)` | Muted UI (`--muted-foreground` maps here in light) |
| `--ink-4` | `oklch(70% 0.01 60)` | Extra-dim meta |

**Dark mode:** `.dark` in `ember-primitives.css` redefines `--paper` / `--paper-2` / `--paper-3` and `--ink*` to match the shadcn dark canvas (`--background` ≈ `--paper` at `oklch(19% 0.018 70)`, `--card` raised above). Pages using `contentStackBackground: "paper"` (`bg-paper`) must not rely on light-only `:root` paper values.

**Surface hierarchy rule:** page canvas = `--paper`, raised card = `--card` (white). Cards appear as a single clean surface above the warm canvas — no double borders or stacked box-shadows.

**`--muted` (shadcn):** In light mode, `--muted` is a **blend** of `--paper-3` toward `--card` (see `shadcn-ember.css`), so banded/beige strips read quieter than raw `--paper-3`.

### Borderless shell (default)

- Sidebar, data tables, cards, and inputs all share `bg-card` (pure white) as one surface family on top of the warm canvas where the page uses paper.
- Grouped regions are separated by a single soft elevation shadow (`--shadow-ember-elevated`), not harsh borders.
- The optional **sharp hairline** variant is enabled via root class `ui-chrome-sharp` on `<html>` (or a subtree); tokens live in `ui-canvas-chrome.css`.
- Keep OKLCH definitions when updating tokens — do not flatten to hex.
- Do **not** pair `.ui-canvas-*` shadow tokens with Tailwind `shadow-none` on the **same** node — pick one elevation story.

### Elevated card hover on `--paper`

White `ui-canvas-elevated` / `bg-card` teasers sitting **directly** on warm `--paper` (KB hub topic grid, module hub cards):

| Do | Don't |
|---|---|
| Keep **`bg-card`** on hover | `hover:bg-accent/*` — accent wash reads as muddy beige and the card **disappears** into `--paper` |
| Deepen shadow in place: `hover:shadow-[var(--e-3)]` | `hover:-translate-*`, `hover:scale-*`, or any hover that moves/resizes the layout box |
| Title underline (`group-hover:underline`) for link affordance | Darkening the card surface toward `--muted` / `--paper-3` |

Shared export (KB module): `kbHubElevatedCardHoverClassName` in `kb-page-shell.ts`.

**Rows inside** an elevated white shell (list rows, FAQ lines): `hover:bg-muted/35` at most — lighter than sidebar `hover:bg-accent/60` because the parent is already white on paper.

### Hover & motion (no layout shift)

Hover, focus, and active feedback on cards, rows, and links must be **paint-only** — nothing that moves the element or changes space in the layout.

| Allowed | Not allowed |
|---|---|
| `box-shadow` / elevation token change (`--e-2` → `--e-3`) | `translate`, `scale`, `margin`, `padding`, `width`, `height` on hover |
| `color`, `opacity`, `underline`, `ring` | Animating layout-affecting properties for hover affordance |
| `background-color` on **rows inside** a white shell | `scale-105`, `-translate-y-*`, bounce/lift micro-interactions on grid cards |

**Principle:** neighbors and scroll position must not jump when the pointer enters a card. If a deeper shadow needs room, reserve it in the static layout (fixed height container, padding) — do not rely on transform to “make room.”

Morph containers (e.g. KB hub search → chat composer) may animate **height** when swapping distinct controls, but individual card/link hovers must not shift the grid.

### Canvas chrome utilities (`ui-canvas-chrome.css`)

Logical surfaces share variables so lists, toolbars, and tables stay aligned:

| Class / concern | Role |
|---|---|
| `.ui-canvas-field` | Single-line controls on canvas (search, select trigger) — hairline border by default |
| `.ui-canvas-outline-control` | Outline / secondary buttons (toolbar, pagination) — soft shadow until `ui-chrome-sharp` |
| `.ui-canvas-table-row` | Per-cell bottom border for row dividers (full bleed with sticky columns) |
| `.ui-canvas-sticky-table-header` | Sticky `<thead>` row (used with `STICKY_HEADER_CLASS`) |
| `.ui-canvas-panel` | Detail / section cards on canvas |
| `.ui-canvas-elevated` | Primary list + table shell |
| `.ui-canvas-raised` | Low-elevation card — stacked group cards inside a list (softer than the shell) |
| `.ui-canvas-stack-top` | Separator above docked footer (e.g. pagination) |
| `.ui-canvas-floating` | Menus / popovers |

Row dividers can be removed per table by zeroing `--ui-canvas-row-divider-w` on `TableBody` (see Data Tables).

### Card surfaces — always use a `ui-canvas-*` class (never hand-rolled)

Cards are **borderless** with a **soft shadow**. Do **not** hand-roll `border …`, `shadow-md`, or `bg-card + border` for a card — pick the right canvas class so light/dark/`ui-chrome-sharp` themes stay consistent and there are no double borders or stacked shadows.

| Use | When | Shadow token |
|---|---|---|
| `.ui-canvas-elevated` | The **primary** list/table shell on the page canvas for **flat-row tables** (`AdminListTableView` without `transparent`), or a standalone teaser card — **not** as a wrapper around responsive card grids | `--shadow-ember-elevated` (`--e-2`) |
| `.ui-canvas-raised` | **Individual cards in a responsive grid** (`AdminListCardsView` + `adminListCardsGridClassName`), or stacked group cards inside a list. Lighter, tighter shadow | `--shadow-ember-soft` |
| `.ui-canvas-panel` | Detail / section cards (settings blocks, read-only panels) | `--shadow-ember-elevated` |

Rules:
- **Radius:** shell/teaser cards `rounded-lg`; `ui-canvas-raised` group cards `rounded-md` (one step tighter so nested cards read as subordinate).
- **No borders** — every `ui-canvas-*` card class drops its border in the default/floating themes (a hairline returns only under `ui-chrome-sharp`). Never add your own `border`.
- **Hover** = paint-only, shadow-in-place: `hover:shadow-[var(--e-3)]` to deepen; keep `bg-card` (never `hover:bg-accent`, which muddies the surface). See Hover & Motion.
- **Group dividers stay transparent** — the collapsible group header (`AdminListGroupHeader`) is not a card; only the rows/cards it groups get the surface.
- **Card grids** — `AdminListCardsView` has no outer shell; each grid item is its own elevated surface on `--paper`. Never wrap a card grid in `.ui-canvas-elevated` (no double borders or stacked shadows).

---

## Typography

| Variable | Value | Tailwind |
|---|---|---|
| `--f-display` (`--font-heading`) | `"Space Grotesk"` | `font-heading` |
| `--f-ui` (`--font-sans`) | `"Geist"` | `font-sans` |
| `--f-mono` | `"Geist Mono"` | `font-mono` |

### Type scale
| Token | Size | Use |
|---|---|---|
| `--t-h1` | 28px | Detail page main heading |
| `--t-h2` | 20px | Section heading |
| `--t-h3` | 16px | Card / group title |
| `--t-body` | 14px | Default body text |
| `--t-ui` | 13px | Compact UI labels |
| `--t-small` | 12px | Secondary / meta text |
| `--t-micro` | 11px | Avatar initials, tight labels |

### Root rem scale

Shell apps (`apps/ui`) set the **document root** so Tailwind `rem` utilities scale the operator UI:

```css
html {
  font-size: 16px;
}

@media (width > 768px) and (width < 1280px) {
  html {
    font-size: 14px;
  }
}
```

- **Default:** `16px` (`1rem` = 16px) — large / external displays.
- **768px–1280px:** `14px` — laptop / split-view compact density (sidebar trees, lists).
- **Sidebar tree rows:** `SidebarMenuButton` / `SidebarRowButton` use **`text-sm`** (dense nav, macOS-like).
- **KB hub lists & topic cards:** **`text-base`** for row/card titles (`kbFlatRowTitleClass`, `kbTopicTeaserTitleClass`).
- **Typography utilities:** Tailwind v4 `--text-*` tokens live in `packages/design-tokens/src/tailwind-type-scale.css` (imported after `@import "tailwindcss"`). Values use **`rem`** so `.text-base` (= `1rem`) tracks the root scale. Fixed px marketing scale (`--t-h1`, `--t-ui`, …) in `ember-primitives.css` is for explicit `text-[length:var(--t-*)]` only — not a substitute for missing `--text-base`.

### Heading rules
- **Page / entity headings** (`h1`): `font-heading font-semibold text-[28px] leading-9 tracking-tight text-foreground`
- **Section headings** inside info/detail cards: `font-heading font-semibold text-lg leading-7 tracking-tight text-foreground`
- **Sidebar section labels**: `text-xxs font-semibold uppercase tracking-wider text-muted-foreground/70`
- Body UI text is always `font-sans` (Geist). Use `font-heading` (Space Grotesk) only for H1/H2 page headings and section titles.

---

## Radius

| Token | Value | Use |
|---|---|---|
| `--r-1` | 2px | Micro indicators |
| `--r-2` | **4px** | **Form fields, control groups, avatars** |
| `--r-3` | 6px | Small buttons, badges |
| `--radius` | 8px | Default shadcn components |
| `--r-4` | 12px | Cards, panels |
| `--r-5` | 16px | Large cards |
| `--r-pill` | 999px | Role/status pill badges |

### Form field radius rule
All single-line text fields and aligned controls (`Input`, `Select`, `InputGroup`, `DatePicker`, `NumberStepper`) use **`rounded-[4px]`** and **`h-8 min-h-8`** (32px).
Import constants from `@engenty/ui-core`:

```ts
import {
  formFieldRadiusClassName,          // "rounded-[4px]"
  formFieldSingleLineHeightClassName, // "h-8 min-h-8"
  formFieldSingleLineMetricsClassName // "h-8 min-h-8 rounded-[4px]"
} from "@engenty/ui-core";
```

**Exception — hub hero search:** module home / hub entry points (Knowledge Base hybrid search) use a **prominent pill**, not compact form metrics. See [Hub hero search](#hub-hero-search) below.

### Hub hero search

Prominent search on warm `--paper` canvas — primary entry before lists and tables. Reference: `KbHubSearchCombobox` (`modules/knowledge-base/ui/components/kb-hub-search-combobox.tsx`).

| Property | Value |
|---|---|
| Height | **`h-11`** (44px) — reserve this height in morph containers until chat composer expands |
| Shape | **`rounded-full`** (pill) |
| Surface | `bg-card`, `border border-input` |
| Elevation | **`shadow-ember-elevated`** (`--shadow-ember-elevated`) — white card lift on paper; do **not** use `ui-canvas-field` |
| Icon | Search icon `left-3`, input `pl-10` |
| Type | `text-sm` |

Autocomplete panel under the pill:

- `.ui-canvas-floating`, `rounded-xl`, `shadow-md`
- **`inset-x-3`** horizontal inset so panel corners do not fight the pill radius
- `top-[calc(100%+0.375rem)]`

Shared class exports (KB module, reusable for other hub surfaces):

```ts
import {
  KB_HUB_HERO_SEARCH_HEIGHT_PX,
  kbHubHeroSearchInputClassName,
  kbHubHeroSearchSuggestPanelClassName,
} from "../lib/kb-page-shell.js"; // knowledge-base module path
```

Do **not** apply `formFieldSingleLineMetricsClassName` or toolbar `h-8` field styling to hub hero search.

**Chat morph (3+ words):** swap to `CopilotComposerSection` in `COPILOT_DOCK_COMPOSER_CARD_CLASS` (`shadow-lg`). The morph container must use **`overflow-visible`** (never `overflow-hidden` on the composer layer — that clips the dock shadow). Reserve **`CHAT_H + 16px`** layout height so the shadow paints fully above content below.

---

## Elevation / Shadows

| Token | Use |
|---|---|
| `--e-1` | Hairline lift (1px) — rarely used directly |
| `--shadow-ember-soft` | Low elevation — **stacked group cards** inside a list (`.ui-canvas-raised`); lighter/tighter than `--e-2` |
| `--shadow-ember-elevated` (`--e-2`) | Default card lift (`.ui-canvas-elevated` / `.ui-canvas-panel`) — canonical two-layer: `0 1px 2px oklch(0.4 0.02 60 / 0.04), 0 8px 24px oklch(0.4 0.02 60 / 0.06)` |
| `--e-3` | Floating panels, dialogs, and **hover-deepen** on elevated cards |
| `--shadow-shell-secondary-edge` | Module secondary nav right-edge shadow (`6px 0 22px -8px oklch(0.35 0.02 60 / 0.085)` light) |

**Elevation hierarchy:** `ui-canvas-elevated` (primary shell, `--e-2`) → `ui-canvas-raised` (group cards, `--shadow-ember-soft`) → flat rows. A `raised` card must never sit on a darker/stronger shadow than the shell that contains it. Define new elevations as tokens in `ember-primitives.css` (light + dark) and surface them through a `--ui-canvas-*-shadow` theme var in `ui-canvas-chrome.css` — never inline a raw `box-shadow` on a card.

**Shell secondary column** (`.shell-divider` in `apps/ui` `index.css`): `box-shadow: var(--shadow-shell-secondary-edge)` across shell themes (`theme-lines`, `theme-floating`, `theme-paper`).

- **`z-index`:** at least `z-20` on the divider column so it stacks above sticky in-column headers (`z-10`).

---

## Page Layout

### Detail pages
- Use `contentStackBackground: "paper"` in `usePageConfig` so the topbar and page share the same warm background.
- Use `topbarChrome: "contentBlend"` to blend the topbar into the page.
- Header: `sticky top-0 z-10 w-full shrink-0 bg-paper`
- Content outer: `flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10` (full-width scroll area)
- Content inner: `mx-auto w-full max-w-5xl` (content width limit)
- The `border-b` separator belongs on the inner `max-w-5xl` wrapper, not on the full-width header, so it aligns with the content.

### List pages

Two supported combinations:

- **Warm canvas + blend** (Knowledge Base and similar module admin lists): `topbarChrome: "contentBlend"` **and** `contentStackBackground: "paper"` — topbar and page share `--paper`; list/table/card shells stay **`bg-card`** with canvas chrome utilities (`.ui-canvas-elevated`, fields, etc.).
- **Card-stack lists** (default app list chrome): `topbarChrome: "contentBlend"` **without** `contentStackBackground` so the stack keeps default **`bg-card`**.

Page root pattern: `flex h-full min-h-0 flex-col gap-3 overflow-hidden p-page` (tweak `gap` / padding per feature).

### Scroll
- Always apply `flex min-h-0 flex-1 flex-col overflow-hidden` down the component tree until the scroll container.
- The scroll container itself gets `overflow-y-auto`.
- Never let `overflow: hidden` higher in the tree clip scrollable children.

### Content width
- Scrollable background spans full column width.
- Content is capped with `max-w-5xl mx-auto` on an inner wrapper — never on the scroll container itself.

---

## Shell & Navigation

Implementation lives in `@engenty/app-shell` (`AppLayout`, `AppTopbar`, `AppSidebar`) plus `@engenty/ui-core` (`ShellBreadcrumbTrail`).

### App topbar (`AppTopbar`)

- **Default** (no `contentBlend`): `h-12`, `border-b`, `bg-card/85 backdrop-blur`, wider gaps; topbar icon buttons use default `size="icon"` sizing (the `size-8` pass applies only in `contentBlend`).
- **`contentBlend`**: `h-10`, transparent background, no border/shadow; mobile menu + secondary toggles use `size-8`; breadcrumb text uses a slightly smaller line (`~12.5px`).
- **`topbarOverlap`**: when set via page config, the topbar is `absolute inset-x-0 top-0` within the non-scrolling column so hero/cover regions can extend underneath.

### Breadcrumbs (`ShellBreadcrumbTrail`)

- Segment separators render as **`/`** (`text-muted-foreground/60`), never `>`.
- The shell passes **`compact`**, **`variant: "truncate"`**, and middle-ellipsis options for dense trails.
- **`enrichFirstBreadcrumbWithNavIcon`** (`app-shell`): may replace the first segment with the matching primary-nav icon unless module secondary nav is **pinned open** (`suppress`) — avoids duplicating the module mark when it already appears in the column header.
- When secondary nav is **open** and `breadcrumbs` is **empty**, the trail is hidden (module title / switcher is expected in `secondaryNavHeaderSlot`); a **module root** icon link can still appear for quick navigation to the module home.

### Primary sidebar rail (`AppSidebar`)

- Uses `--sidebar*` tokens from `shadcn-ember.css`: **saturated Ember** rail (not neutral gray).
- **Active** item: `bg-sidebar-accent font-medium text-sidebar-accent-foreground`; parent routes stay active when a child path matches.

### Topbar actions (`contentBlend` pages)

Buttons in `secondaryNavHeaderSlot` / topbar action area use compact sizing:
`h-7 min-w-0 px-2 text-xs gap-1` with `size-3.5` SVG icons (see `AppTopbar` `app-topbar-actions` cascade overrides for nested controls).

### Module secondary sidebar
- Min z-index: `z-20`
- Shadow: `box-shadow: var(--shadow-shell-secondary-edge)`
- Applied via `.shell-divider` in `apps/ui/src/index.css`
- Header row height: `h-10` (not `h-8`) for `contentBlend` pages

### Secondary nav panel (sidebar body)
- Place search input and role links inside `secondaryNavAfterItems` (not `secondaryNavHeaderSlot`)
- `secondaryNavHeaderSlot` should be `null` when the panel owns the full sidebar body
- Use `useSecondaryNavSearchResultsOnly(true)` to suppress shell-registered nav links when the panel renders its own

### Knowledge Base module shell

- Hook: `useKbModuleSecondaryShellNav` — wires **`secondaryNavHeaderSlot`** (KB switcher), **`secondaryNavAfterItems`** (`KbSidebar` article tree + `KbModuleScopedNavLinks`), and **`kbRootCrumb`** for breadcrumbs.
- **`kbRootCrumb`:** KB picker as the first breadcrumb segment when the secondary column is **closed** and multiple KBs exist; **null** when the column is **open** so the switcher is not duplicated.
- **Routes:** Most KB pages use `contentStackBackground: "paper"` with `contentBlend` (see Page layout — warm canvas + blend). Full-bleed views (e.g. graph) may omit `contentStackBackground` for edge-to-edge canvas behavior.
- **Actions:** Primary add-source / adapter entry points live in **`KbModuleShellActions`** in the module topbar — do not duplicate that CTA in list toolbars.
- **Lists:** Toolbar filters and display toggles sit on the same **`bg-card`** canvas strip as the table/cards — **no** extra tinted “filter plate” behind the toolbar row.
- **Detail / hub UX:** Inline field chrome for titles and metadata (offers-style), hub hybrid search with a layout-stable swap to chat-style input for longer queries — hub search uses the [Hub hero search](#hub-hero-search) pill (not compact `h-8` fields); see `modules/knowledge-base/AGENTS.md` for copy and interaction specifics.

### Contacts sidebar layout
```
[Search input]          ← px-2, h-8, always visible
───────────────────────
Alle / Kunden / ...     ← role filter nav links
───────────────────────
AKTUELLE                ← section label
Contact Name            ← recent contacts list
...
```
- Search navigates globally; it coexists with the toolbar search on the list page
- Section labels: `text-xxs font-semibold uppercase tracking-wider text-muted-foreground/70`
- Nav item: `rounded-md px-2.5 py-1.5 text-sm hover:bg-accent/60`
- Active item: `bg-secondary font-medium text-foreground`
- Divider between roles and recents: `border-t border-border/50 mx-2`

---

## Forms & Edit Pages

### Label column
Width: `w-52 sm:w-56 md:w-60 shrink-0`
Alignment: `items-start` (not `items-center`) with `pt-1.5` on the label

### Form row grid
`sm:grid-cols-[minmax(10rem,38%)_minmax(0,1fr)]` with `gap-x-8`

### Edit pages
- No AI enrichment button in `pageActions` topbar
- Still invoke the copilot hook (e.g. `useContactEditCopilot`) so `?copilot=open` deep-linking works
- Page must be scrollable: `flex min-h-0 flex-1 flex-col overflow-y-auto pb-10`

---

## Cards & Info Sections

### Card padding (info/detail tabs)
- `py-2 px-0` on the `Card` element (8px vertical, no horizontal — let inner rows provide horizontal padding)
- Inner row container: `px-5 sm:px-6`
- No stacked card + page padding (`p-page` + `p-4` = double padding → avoid)
- One `Card` surface per `SettingsFormSection` — no nested cards

### Key-value rows (contact info tab)
```tsx
// Row
"flex flex-col gap-1.5 py-3 sm:grid sm:grid-cols-[minmax(10rem,38%)_minmax(0,1fr)] sm:items-start sm:gap-x-8"
// Label
"text-muted-foreground text-sm font-normal leading-snug sm:pt-px"
// Value
"min-w-0 text-foreground text-sm font-normal leading-snug break-words"
```
Rows inside a card group: `divide-y divide-border/50`

---

## Data Tables

### Row dividers
Remove body row dividers by setting the CSS variable on `TableBody`:
```tsx
<TableBody className="[--ui-canvas-row-divider-w:0px]">
```
Rows are differentiated by hover state only (matching the clean card-list reference).
Header row bottom border is unaffected (lives in `<thead>`).

### Table header background
The sticky header must match the table surface — **do not apply a contrasting background to it**.
Use `STICKY_HEADER_CLASS` from `@engenty/ui-core` (applies **`ui-canvas-sticky-table-header`** plus `[&_th]:bg-card` so each `<th>` is opaque and matches the surrounding card/table surface):
```tsx
import { STICKY_HEADER_CLASS } from "@engenty/ui-core";

<TableHeader className={STICKY_HEADER_CLASS}>
```
The checkbox sticky column uses `STICKY_CHECKBOX_HEADER_CLASS` / `STICKY_CHECKBOX_CELL_CLASS` from the same import — both use `bg-card` so the pinned column blends with the table.
Do **not** override with `bg-paper` on the header: the table surface is `bg-card` (white) regardless of page canvas color.

### Sort header style (`TableSortableHeader`)
- Sort icon is **inline after the label text** (not right-aligned)
- Active column: arrow always visible at `h-3 w-3`
- Inactive column: icon hidden, fades to 40% on hover

### Entity avatar (name cell)
- Fixed color by **type**, not by entity ID:
  - Organisation → blue: `bg-blue-100 text-blue-700`
  - Person → violet: `bg-violet-100 text-violet-700`
- Show `Building2` (org) or `User` (person) icon inside the avatar
- Avatar: `h-7 w-7 rounded flex items-center justify-center` (compact: `h-6 w-6`)
- Icon: `size-3.5 strokeWidth={1.75}` (compact: `size-3`)

### Name cell (two-line)
```
[Avatar]  Primary name (bold, text-sm)
          Email or secondary name (text-xs text-muted-foreground)
```
Secondary line hidden in compact mode.

### Role badge pills
Rendered as `<span>` with `rounded-full px-2 py-0.5 text-xs font-medium leading-none`:

| Role | Color |
|---|---|
| `client` | `bg-blue-100 text-blue-700` |
| `partner` | `bg-violet-100 text-violet-700` |
| `supplier` | `bg-emerald-100 text-emerald-700` |
| `team` | `bg-amber-100 text-amber-700` |
| custom | hash-picked from remaining pool |

Dark mode equivalents use `dark:bg-*-900/40 dark:text-*-300`.

### Default column set (contacts list)
`legalName → roles → email → location → createdAt`
Hidden by default: `displayName`, `contactName`, `phone`

### Created / relative time column
Shows human-readable relative time ("4h ago", "2d ago", "just now") for `created_at`.

---

## Buttons & Controls

### ButtonGroup
- Do **not** use `overflow-hidden rounded-lg` on the `ButtonGroup` wrapper
- Apply `rounded-[4px]` directly to each button inside the group
- `ButtonGroup` variant selectors handle flat inner corners and collapsed middle border automatically

### Toolbar icon buttons
`h-8 w-8 rounded-[4px] shadow-none` — matches the 32px field height standard.

### Animated icons (`@engenty/ui-icons`)

Motion-based icons adapted from [lucide-animated](https://lucide-animated.com/) (MIT, [pqoqubbw/icons](https://github.com/pqoqubbw/icons)). Use for **micro-feedback** only — not tables, dense sidebars, or breadcrumb chrome.

| Export | Typical use |
|---|---|
| `AnimatedLoaderIcon` | In-flight buttons/forms (`play="always"`, `size="sm"`) — replaces `Loader2` + `animate-spin` |
| `AnimatedCheckIcon` | Success flash after save/copy (`play="controlled"` + ref, or hover on icon buttons) |
| `AnimatedCopyIcon` | Copy-to-clipboard controls (hover affordance) |
| `AnimatedRefreshIcon` | Retry / re-sync / regenerate slug (hover; `play="always"` while job runs) |
| `AnimatedDownloadIcon` | Export / download actions (hover) |
| `AnimatedSendIcon` | Submit / send message (hover on enabled control) |

**Import:** `@engenty/ui-icons` — same package as dock icons (`Dock*`).

**Wrapper:** `AnimatedIcon` (or the named `Animated*` components built on it) provides:

- **Size tokens:** `xs` (14px / `size-3.5`), `sm` (16 / `size-4`), `md` (20 / `size-5`), `lg` (24 / `size-6`), or a numeric pixel override
- **Play:** `hover` (default), `always` (loop while mounted), `controlled` (imperative `AnimatedIconHandle` only)
- **`label`:** sets `aria-label` for icon-only controls
- **`prefers-reduced-motion`:** animations stay static

**Rules:**

- Keep static `lucide-react` for list rows, nav, sort headers, and avatars.
- Icon-only buttons: pass `label` (or wrap in control with visible text).
- Do not animate layout-affecting transforms on parent cards/rows (see **Hover & motion** above); motion stays inside the icon box.
- Add new glyphs by copying from lucide-animated into `packages/ui-icons/src/animated/icons/` and exporting from `src/animated/index.ts` — do not import the registry ad hoc in modules.

```tsx
import { AnimatedLoaderIcon } from "@engenty/ui-icons";

<Button disabled>
  <AnimatedLoaderIcon play="always" size="sm" className="text-muted-foreground" />
  Saving…
</Button>
```

---

## Color Palette Reference

### Brand
- **Ember** `oklch(64% 0.195 35)` — primary CTA, active states
- **Ember Strong** `oklch(54% 0.205 32)` — pressed/darker

### Accent primitives
- **Cobalt** `oklch(50% 0.18 264)` — links, info
- **Moss** `oklch(48% 0.13 150)` — success
- **Amber** `oklch(72% 0.16 68)` — warning, team
- **Rose** `oklch(58% 0.2 18)` — rose accent / badge swatches
- **Danger** (`--danger`, shadcn `--destructive`) `oklch(64% 0.2 25)` — destructive actions and error emphasis

### Presets / Color Sets
- **Ember (Default)**: Primary `#e0531b`, Secondary `#f1f3f5`, Background `#faf8f5`
- **Ocean Blue**: Primary `#0284C5`, Secondary `#B3CCE6`, Background `#EDF2F7`

### Semantic role colors (Tailwind)
These are the same palettes used for entity/role badges throughout the UI:

| Swatch | bg (light) | text (light) |
|---|---|---|
| Blue | `bg-blue-100` | `text-blue-700` |
| Violet | `bg-violet-100` | `text-violet-700` |
| Emerald | `bg-emerald-100` | `text-emerald-700` |
| Amber | `bg-amber-100` | `text-amber-700` |
| Rose | `bg-rose-100` | `text-rose-700` |
| Sky | `bg-sky-100` | `text-sky-700` |
| Teal | `bg-teal-100` | `text-teal-700` |
| Orange | `bg-orange-100` | `text-orange-700` |

Always pair with `dark:bg-*-900/40 dark:text-*-300`.

---

## Compact UI Preferences

- Avoid unnecessary `h-*`, `px-*`, extra padding, and boxed wrapper surfaces around sidebar/menu areas — prefer direct-on-canvas layout
- `DropdownMenuGroup` with `my-0` separators: add `py-1` to prevent hover/divider collision
- Use **slim** shell topbar variant on Dashboard and aligned shell pages
- `contentBlend` pages: topbar height `h-10` for secondary column header row controls
