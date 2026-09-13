# Engenty Design System

Living reference for visual patterns, tokens, and component rules.
Update whenever a new pattern is established or an existing one is revised.

**Agent priority:** This file is the **canonical** source for visual UI (tokens, typography, spacing, shell, tables, forms, elevation). It outranks shadcn defaults, ad-hoc Tailwind, and `docs/agent/rules/*` when they conflict on look-and-feel. Flow rules (routes, breadcrumbs, display dialog) live in `docs/agent/rules/*-ui*.mdc` and must still conform to patterns here.

### Sources of truth (code)

- **Primitives & type scale:** `packages/design-tokens/src/ember-primitives.css` (`--paper`, `--ember`, shadows, `--t-*`, `--r-*`, etc.).
- **shadcn semantic mapping (light/dark):** `packages/design-tokens/src/shadcn-ember.css` (`--background` → canvas, `--card`, `--sidebar`, `--muted`, …).
- **List / toolbar / table chrome:** `packages/design-tokens/src/ui-canvas-chrome.css` (CSS variables + `.ui-canvas-*` utilities).
- **Main-area scroll:** `--ui-scroll-safe-bottom` / `.ui-page-scroll` / `pb-scroll-safe` (same file + `uiPageScrollClassName` in `@engenty/ui-core`). Shell sets the variable on `<main>` so the copilot bottom dock does not stack with the FAB inset.
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

- Secondary column, data tables, cards, and inputs all share `bg-card` (pure white) as one surface family on top of the warm canvas where the page uses paper. The **app bar is canvas family**, not white: `--paper` in light, one step below the canvas in dark — it is the frame the white column sits on.
- Grouped regions are separated by a single soft elevation shadow (`--shadow-ember-elevated`), not harsh borders.
- The optional **sharp hairline** variant is enabled via root class `ui-chrome-sharp` on `<html>` (or a subtree); tokens live in `ui-canvas-chrome.css`.
- Optional **glass fill** stub: root class `ui-chrome-glass` flips `--ui-card-bg` + `--ui-card-filter` so every `ui-card-*` surface becomes translucent without TSX changes. Not wired to product UI yet — default stays opaque `--card`.
- Keep OKLCH definitions when updating tokens — do not flatten to hex.
- Do **not** pair `.ui-canvas-*` / `.ui-card-*` shadow tokens with Tailwind `shadow-none` on the **same** node — pick one elevation story.
- Do **not** add Tailwind `border`, `bg-card`, `rounded-*`, `hover:bg-*`, or `hover:shadow-*` on the same node as a `ui-card-*` / `ui-canvas-{raised,elevated,panel}` class — those classes own fill, radius, border, shadow, and hover.

### Elevated card hover on `--paper`

White `ui-card-elevated` / `ui-card-raised` teasers sitting **directly** on warm `--paper` (KB hub topic grid, module hub cards):

| Do | Don't |
|---|---|
| Let the chrome class keep fill (`--ui-card-hover-bg` = `--ui-card-bg`) | `hover:bg-accent/*` — accent wash reads as muddy beige and the card **disappears** into `--paper` |
| Deepen shadow in place via `.ui-card-interactive` or by making the card the `a` / `button` | `hover:-translate-*`, `hover:scale-*`, or any hover that moves/resizes the layout box |
| Title underline (`group-hover:underline`) for link affordance | Darkening the card surface toward `--muted` / `--paper-3` |

Shared export for space-data status tiles: `uiStatusCardClassName` from `@engenty/ui-core`.

**Rows inside** an elevated white shell (list rows, FAQ lines): `.ui-row-hover` (token `--ui-row-hover-bg`, muted 35%) — lighter than sidebar `hover:bg-accent/60` because the parent is already white on paper. Table rows get the same token from `.ui-canvas-table-row:hover`.

### Hover & motion (no layout shift)

Hover, focus, and active feedback on cards, rows, and links must be **paint-only** — nothing that moves the element or changes space in the layout.

| Allowed | Not allowed |
|---|---|
| `box-shadow` / elevation token change (`--e-2` → `--e-3`) | `translate`, `scale`, `margin`, `padding`, `width`, `height` on hover |
| `color`, `opacity`, `underline`, `ring` | Animating layout-affecting properties for hover affordance |
| `background-color` on **rows inside** a white shell | `scale-105`, `-translate-y-*`, bounce/lift micro-interactions on grid cards |

**Principle:** neighbors and scroll position must not jump when the pointer enters a card. If a deeper shadow needs room, reserve it in the static layout (fixed height container, padding) — do not rely on transform to “make room.”

**Overflow text marquee** (sidebar two-line rows) may `translateX` the **inner** truncated string on hover so the rest of the line can be read. The row/card box stays still — overflow hidden, no scale, no size change. If the string already fits, do not animate. Pause and reset when hover ends.

Morph containers (e.g. KB hub search → chat composer) may animate **height** when swapping distinct controls, but individual card/link hovers must not shift the grid.

### Canvas chrome utilities (`ui-canvas-chrome.css`)

Logical surfaces share variables so lists, toolbars, and tables stay aligned:

| Class / concern | Role |
|---|---|
| `.ui-canvas-field` | Single-line controls on canvas (search, select trigger) — hairline border by default |
| `.ui-canvas-outline-control` | Outline / secondary buttons (toolbar, pagination) — soft shadow until `ui-chrome-sharp` |
| `.ui-canvas-table-row` | Per-cell bottom border for row dividers (full bleed with sticky columns) |
| `.ui-canvas-sticky-table-header` | Sticky `<thead>` row (used with `STICKY_HEADER_CLASS`) |
| `.ui-canvas-panel` / `.ui-card-panel` | Detail / section cards on canvas — owns fill, `rounded-lg`, shadow |
| `.ui-canvas-elevated` / `.ui-card-elevated` | Primary list + table shell — owns fill, `rounded-lg`, shadow |
| `.ui-canvas-raised` / `.ui-card-raised` | Low-elevation card — stacked group / grid cards (softer; `rounded-md`) |
| `.ui-card-interactive` | Hover deepen on a wrapping `div` (stretch-link hubs). `a` / `button` / `role=button` surfaces hover automatically |
| `.ui-card-selected` | Selected / active card — 1px primary outline + primary-tinted shadow |
| `.ui-row-hover` | Row hover inside a white shell (`--ui-row-hover-bg`) |
| `.ui-canvas-stack-top` | Separator above docked footer (e.g. pagination) |
| `.ui-canvas-floating` | Menus / popovers |
| `.ui-canvas-glass` | Translucent menus/dialogs (`--popover` at 72% alpha + blur). Put fill, blur, overlay shadow, **and** enter/exit scale on the **Popup** (one node) so the card grows from `--transform-origin` (the trigger). The Positioner is a positioning shell only — scaling it fights Base UI’s placement transform and collapses origin to the top-left. **Never** pair Tailwind `ring-*` with `shadow-*` on it. |

Row dividers can be removed per table by zeroing `--ui-canvas-row-divider-w` on `TableBody` (see Data Tables).

### Card surfaces — always use a `ui-card-*` class (never hand-rolled)

Prefer **`ui-card-*`** for card surfaces (`ui-canvas-*` names remain as aliases). Each class owns **fill, radius, border, shadow, and hover**. Do **not** hand-roll `border …`, `shadow-md`, `ring-*`, `bg-card`, `rounded-*`, or `hover:bg-*` on the same node — pick the right class so light/dark/`ui-chrome-sharp`/`ui-chrome-glass` themes stay consistent and there are no double borders or stacked shadows.

| Use | When | Shadow token |
|---|---|---|
| `.ui-card-elevated` | The **primary** list/table shell on the page canvas for **flat-row tables** (`AdminListTableView` without `transparent`), or a standalone teaser card — **not** as a wrapper around responsive card grids | `--shadow-ember-elevated` (`--e-2`) |
| `.ui-card-raised` | **Individual cards in a responsive grid** (`AdminListCardsView` + `adminListCardsGridClassName`), or stacked group cards inside a list. Lighter, tighter shadow | `--shadow-ember-soft` |
| `.ui-card-panel` | Detail / section cards (settings blocks, read-only panels) | `--shadow-ember-elevated` |
| `.ui-card-interactive` | Modifier: hover deepen on a wrapping `div`. Not needed when the card element *is* `a` / `button` / `role=button` | `--ui-card-hover-shadow` (`--e-3`) |
| `.ui-card-selected` | Multi-select / active state on a card — pair with raised/elevated/panel | `--ui-card-selected-shadow` |
| `.ui-row-hover` | Hover on a row **inside** a white shell (folder lists). Table rows use `.ui-canvas-table-row` | `--ui-row-hover-bg` |

Rules:
- **Radius** lives on the class: shell/panel `rounded-lg` (`--ui-card-elevated-radius`); raised `rounded-md` (`--ui-card-raised-radius`). Do not also set `rounded-*` on the same node.
- **Fill** lives on the class (`--ui-card-bg`, default `--card`). Do not also set `bg-card`. Future `html.ui-chrome-glass` flips fill + blur via `--ui-card-filter`.
- **No borders** — every `ui-card-*` / `ui-canvas-*` card class drops its border in the default/floating themes (a hairline returns only under `ui-chrome-sharp`). Never add your own `border` — selection uses `.ui-card-selected` instead.
- **Hover** = paint-only, shadow-in-place, owned by the class (`--ui-card-hover-shadow`). Never `hover:bg-accent` / `hover:bg-muted` on the card itself. When selected, omit Tailwind `shadow-*` / `ring-*` — `.ui-card-selected` owns the elevation (including `:hover`).
- **Group dividers stay transparent** — the collapsible group header (`AdminListGroupHeader`) is not a card; only the rows/cards it groups get the surface.
- **Card grids** — `AdminListCardsView` has no outer shell; each grid item is its own elevated surface on `--paper`. Never wrap a card grid in `.ui-card-elevated` (no double borders or stacked shadows).
- **Layout stays Tailwind** — `flex`, `gap`, `p-*`, typography. Chrome does not.

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
- **Page / entity headings** (`h1` in `DetailPageHeader`): `font-heading font-semibold text-[28px] leading-9 tracking-tight text-foreground`
- **Section headings** — do **not** hand-roll Tailwind. Use **`CardSection.Header`** / convenience `headerVariant`:
  - **`default`** — form/detail above a card (`font-medium text-lg`)
  - **`compact`** — drawer / doc-sidebar sections (`font-semibold text-sm`; description `text-xs`)
  - **`meta`** — overview/meta labels (muted uppercase `text-xs`)
  - **`display`** — hub sections (`font-heading text-lg`; also `cardSectionHeaderTitleVariants({ variant: "display" })`)
- Static translated labels only (`Basic Information`, `Public Profile Info`). Do **not** interpolate entity values into the heading (`Name: Jane Doe` is wrong; put the value in a KV row or the page `h1`).
- **Sidebar section labels**: `text-xxs font-semibold uppercase tracking-wider text-muted-foreground/70`
- Body UI text is always `font-sans` (Geist). Use `font-heading` (Space Grotesk) only for the page/entity `h1` and `CardSection` **`display`** headers.

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
All single-line text fields and aligned controls (`Input`, `Select`, `InputGroup`, `Combobox` / `ComboboxChips`, `DatePicker`, `NumberStepper`) use **`rounded-[4px]`** and **`h-8 min-h-8`** (32px). Wrapping chip inputs keep **`min-h-8`** and may grow vertically.
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
| `--shadow-shell-secondary-edge` / `--shadow-shell-copilot-edge` | Secondary column and copilot sidebar as the raised card between app bar and main — **ambient** (`0 2px 24px -8px oklch(0.35 0.02 60 / 0.14)` light), never directional, so it separates on both sides and survives a top/bottom/right app bar |

**Elevation hierarchy:** `ui-card-elevated` (primary shell, `--e-2`) → `ui-card-raised` (group cards, `--shadow-ember-soft`) → flat rows. A `raised` card must never sit on a darker/stronger shadow than the shell that contains it. Define new elevations as tokens in `ember-primitives.css` (light + dark) and surface them through a `--ui-canvas-*-shadow` / `--ui-card-*-shadow` theme var in `ui-canvas-chrome.css` — never inline a raw `box-shadow` on a card.

**Shell secondary column** (`.shell-divider` in `apps/ui` `index.css`): `box-shadow: var(--shadow-shell-secondary-edge)` across shell themes (`theme-lines`, `theme-floating`, `theme-paper`).

- **`z-index`:** at least `z-20` on the divider column so it stacks above sticky in-column headers (`z-10`).

---

## Page Layout

### Detail pages
- Use `contentStackBackground: "paper"` in `usePageConfig` so the topbar and page share the same warm background.
- Use `topbarChrome: "contentBlend"` to blend the topbar into the page.
- Header: `sticky top-0 z-10 w-full shrink-0 bg-paper`
- Content outer: `flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-scroll-safe` (full-width scroll area), or `.ui-page-scroll` when the scroller is not also `p-page`.
- Content inner: `mx-auto w-full max-w-5xl` (content width limit)
- The `border-b` separator belongs on the inner `max-w-5xl` wrapper, not on the full-width header, so it aligns with the content.

### Doc sidebar (document settings / properties)

The **doc sidebar** is the settings/properties panel that belongs to a document or detail view (offer & invoice drafts, task properties). One shared, responsive component — never a bespoke Sheet or hand-rolled grid rail.

- **Components** (`@engenty/ui-core`): `DocSidebarLayout` wraps the document + sidebar; `DocSidebarToggle` toggles it; `useDocSidebar(storageKey)` reads state. Same `storageKey` on all three. Visibility persists per user at `localStorage["engenty.doc_sidebar:<key>"]`; the overlay-open state is transient (a page never loads with the Sheet already open).
- **Inline vs overlay** is measured on the **full available width** (an outer full-width wrapper), *independent* of the content max-width cap — so a page may narrow its content when the sidebar is closed without that cap forcing overlay mode. Default threshold `DOC_SIDEBAR_INLINE_MIN_WIDTH_PX` = **800px**; inline column `DOC_SIDEBAR_WIDTH_PX` = **280px**; overlay is a right-side Sheet at **`sm:max-w-sm`** (384px). Wide documents raise the threshold via `inlineMinWidth` — offers/invoices use **1200** so the document keeps ~920px beside the 280px column, else it drops to the drawer.
- **Content width follows sidebar state**: cap the document at **`max-w-6xl`** when the sidebar is closed/overlay and **`max-w-7xl`** only when it is inline-open (`mode === "inline" && open`). Apply the same conditional cap to the document toolbar row so its edge aligns with the sidebar. Gap between document and inline column: `gap-8`.
- **The toggle belongs to the document, not the shell topbar.** Place `DocSidebarToggle` at the right edge of the document toolbar (the shell topbar's right edge is for workspace/pane controls). Pass `text` for a visible desktop label (`hidden sm:inline`); the icon alone remains on narrow screens.
- **Sidebar contents**: `SettingsSection` (heading block `space-y-2`, `text-sm` heading, `text-xs` description) stacked at `gap-5`; cards use **`.ui-card-raised`** / **`.ui-card-panel`** (soft shadow, **no border**) — see Card surfaces. Never give a settings card its own `border`. Overlay sheet inset: header `p-4`, body `px-4 pb-4` (no extra top pad). The agent desk settings drawer is **not** a `DocSidebarLayout` (that pattern is document+properties), but it uses the same content density: `CardSection` `headerVariant="compact"`, sections at `gap-5`.

### Blended document header

Draft/detail documents (offers, invoices) use a **blended** header so the transparent topbar merges into one white band:

- Header surface: `w-full border-border border-b bg-card` with inner `pt-14` (clears the ~44px floating topbar). Pair with `usePageConfig({ topbarChrome: "contentBlend", topbarOverlap: true })`.
- **Compact-on-scroll**: the header sits *outside* the scroll container and collapses to a single line (compact status badge + a smaller `text-xl` title) once the content scrolls past a small threshold. Drive `collapsed` from `useScrollCollapse()` (attach its `scrollRef` + `onScroll` to the scroll container). Because the header is outside the scroll area, collapsing it never moves the scroll position — a single threshold is flicker-free. Animate the full↔compact swap with the CSS `grid-rows-[1fr]/[0fr]` cross-fade (no JS height measurement).

### List pages

Two supported combinations:

- **Warm canvas + blend** (Knowledge Base and similar module admin lists): `topbarChrome: "contentBlend"` **and** `contentStackBackground: "paper"` — topbar and page share `--paper`; list/table/card shells stay **`bg-card`** with canvas chrome utilities (`.ui-canvas-elevated`, fields, etc.).
- **Card-stack lists** (default app list chrome): `topbarChrome: "contentBlend"` **without** `contentStackBackground` so the stack keeps default **`bg-card`**.

Page root pattern: `flex h-full min-h-0 flex-col gap-3 overflow-hidden p-page` (tweak `gap` / padding per feature).

### Scroll
- Always apply `flex min-h-0 flex-1 flex-col overflow-hidden` down the component tree until the scroll container.
- The scroll container itself gets `overflow-y-auto`.
- Never let `overflow: hidden` higher in the tree clip scrollable children.
- Stacked column dashboards (space home: composer + `embedOnHome` module) share **one** scroller — the outer column. Wrap the embed in `shrink-0` so it sizes to content. Do not let the embed keep `flex-1 min-h-0 overflow-y-auto` as a flex child of that column, or it becomes a nested viewport and the top block stays pinned.
- **Bottom safe area:** every main-area scroller ends with `--ui-scroll-safe-bottom` (`96px`, FAB 60 + inset 16 + breathing) so the last block can scroll clear of overlapping chrome. Use `.ui-page-scroll` (`uiPageScrollClassName`) as the page root, or `pb-scroll-safe` when the node already has `overflow-y-auto` (typical: `p-page pb-scroll-safe`). Do not use `pb-10` for this. Full-bleed boards/chat that clip rather than scroll do not take this pad.

### Content width
- Scrollable background spans full column width.
- Content is capped with `max-w-5xl mx-auto` on an inner wrapper — never on the scroll container itself.

---

## Shell & Navigation

Implementation lives in `@engenty/app-shell` (`AppLayout`, `AppTopbar`, `AppSidebar`) plus `@engenty/ui-core` (`ShellBreadcrumbTrail`).

### Shell chrome rules

Decided 2026-09-05 (PLAN-shell-chrome, variant B). Enforced by `pnpm check:shell-chrome` in CI.

**Layer model, not edge model.** Three layers; an edge is wherever two layers meet, on whichever side (the app bar may later sit top, bottom or right — write rules in logical terms, never `border-r`).

| Layer | Light | Dark | Separates by |
|---|---|---|---|
| 0 frame — app bar (`--sidebar`, seeded by `--raw-sidebar`) | `--paper` (the page canvas) | one step below the canvas (L .12) | nothing drawn; colour presets separate by hue |
| 1 raised — secondary column, copilot sidebar (`--card`) | white | `--paper-2` | ambient shadow `--shadow-shell-secondary-edge` / `--shadow-shell-copilot-edge` |
| canvas — main (`--background` / `--card`) | as the page sets it | as the page sets it | — |

**One idiom per role.**

| Role | Idiom | Never |
|---|---|---|
| Pinned layout column edge (app bar, secondary column, copilot) | surface step or the raised column's ambient shadow | an opaque hairline |
| Floating panel over content (hover preview, menus) | `ui-canvas-floating` / glass + `--shadow-ember-overlay` | an added `border-*` or `ring-*` (rings clobber the overlay shadow) |
| Sticky header over scrolling content (topbar band, list header) | shadow that appears once content scrolls under it | a permanent `border-b` |
| Rule inside content (table row, form group, card section) | `border-border` or `border-border-soft` | a shadow |
| Zone break inside a column (rail zones, nav sections) | spacing or a heading | a short separator line |

**Two line tokens.** `border-border` (default) and `border-border-soft` (`--border-soft`, half strength). `border-border/NN` and `divide-border/NN` are forbidden. `--sidebar-border` is for furniture inside the app bar (user-menu separators, the dashed new-space tile, the hidden-rail pill), never a layout edge. `--hairline*` no longer exists. `ring-border/NN` / `bg-border/NN` are fills and rings, not rules, and are outside this rule.

**Shell row grid.** `--shell-row` (44px): topbar, secondary-column header, and a horizontal app bar. `--shell-footer` (48px): the rail's user-menu row and the column's Settings/About row, content centred, no rule above either. The first space tile has even 10px margins in the 56px rail.

**Topbar is part of the page.** Transparent on the main area's own surface, compact density, no border, no blur, by default; `topbarChrome: "band"` is the only opt-in (card strip, wider density, still no `border-b`). `"contentBlend"` no longer exists.

**Space chooser is one row** in the column header: toggle · 20px tile · name · chevron. Collapsed, the same chooser leads the topbar trail. Modules do not repeat their own name as the first page crumb.

**Furniture controls** (column toggle, module-root trail icon, resize handle) use a muted colour that goes full on hover, never `opacity-*`.

**Breadcrumb slash** is `text-border` in the topbar and in `ShellBreadcrumbTrail`.

### App topbar (`AppTopbar`)

- The topbar is **part of the page, not a bar over it**: by default transparent on the main area's own surface, no border, compact density (`gap-1 px-2`, `size-8` toggles, `~12.5px` crumbs, the compact actions cascade). Height is `--shell-row` (44px), the same row as the secondary column header. Pages set nothing — `topbarChrome: "contentBlend"` no longer exists.
- **`topbarChrome: "band"`** is the opt-in for a page that needs a distinct sticky strip: `bg-card/85 backdrop-blur`, wider density (`gap-2 px-3`, `size="icon"` buttons), still **no `border-b`**. Nothing opts in yet; a module whose white list looks odd under a paper topbar row should set `contentStackBackground: "card"` first and reach for the band only if it truly needs a strip.
- **Furniture controls** (column toggle, module-root icon in the trail) are `text-muted-foreground` → `text-foreground` on hover — a colour step, never `opacity-*`, so the glyph does not ghost the surface behind it.
- **`topbarOverlap`**: when set via page config, the topbar is `absolute inset-x-0 top-0` within the non-scrolling column so hero/cover regions can extend underneath.

### Breadcrumbs (`ShellBreadcrumbTrail`)

- Segment separators render as **`/`** (`text-muted-foreground/60`), never `>`.
- The shell passes **`compact`**, **`variant: "truncate"`**, and middle-ellipsis options for dense trails.
- **`enrichFirstBreadcrumbWithNavIcon`** (`app-shell`): may replace the first segment with the matching primary-nav icon unless module secondary nav is **pinned open** (`suppress`) — avoids duplicating the module mark when it already appears in the column header.
- When secondary nav is **open** and `breadcrumbs` is **empty**, the trail is hidden (module title / switcher is expected in `secondaryNavHeaderSlot`); a **module root** icon link can still appear for quick navigation to the module home.
- A segment whose `label` is a picker (ReactNode) is **not** wrapped in a trail `<a>` — the trigger is already a button. `to` still feeds the compact overflow menu.
- A picker as the **first** crumb sits flush after the column toggle — no leading `/`. The slash still separates later segments (`Company ▾ / Contacts`).

### Primary sidebar rail (`AppSidebar`)

- Uses `--sidebar*` tokens from `shadcn-ember.css`, seeded by `--raw-sidebar`.
- **No line on its edge**, no `border-r`, no footer `border-t`. The rail is the shell's frame layer: light default seed is `var(--paper)` (the page canvas), dark default is one step below the canvas (`.dark --raw-sidebar` in `ember-primitives.css`); the Ember preset's `dark.sidebar` is empty so CSS owns it. Colour presets keep their own rail hex — they separate by hue. The white column beside it is the raised card; its ambient shadow is the edge.
- **Row grid:** the first space tile sits 10px from the top, the same as its side margins in the 56px rail (`pt-1.5` + the zone's `py-1`); the user-menu footer is one `--shell-footer` row (48px), lineless, level with the column's Settings footer.
- **Active** item: `bg-sidebar-accent font-medium text-sidebar-accent-foreground`; parent routes stay active when a child path matches.
- **Zones are separated by spacing, never by a short rule**: spaces zone `pb-2` + nav `py-1`, sections `mb-4`. Filled space tiles vs line glyphs already mark the zone change.
- **No tenant tile.** The compact rail starts with spaces (then apps). About opens from the Settings / Setup column footer (brand name + plan · version); clicking it opens the About modal. Superadmins switch tenants on **Settings → Tenant**, not from a rail popover.

### Topbar actions (`contentBlend` pages)

Buttons in `secondaryNavHeaderSlot` / topbar action area use compact sizing:
`h-7 min-w-0 px-2 text-xs gap-1` with `size-3.5` SVG icons (see `AppTopbar` `app-topbar-actions` cascade overrides for nested controls).

### Module secondary sidebar
- Min z-index: `z-20`
- Shadow: `box-shadow: var(--shadow-shell-secondary-edge)` (ambient) — applied via `.shell-divider` in `apps/ui/src/index.css`. No `border-r` on the pinned column, and none on the hover overlay either (`ui-canvas-floating`'s shadow is its edge).
- Header row: `h-(--shell-row)` (44px) in every variant, no `border-b`. Footer (`Settings` / About): `h-(--shell-footer)` (48px), content centred, no `border-t`.

### Secondary nav panel (sidebar body)
- Place search input and role links inside `secondaryNavAfterItems` (not `secondaryNavHeaderSlot`)
- `secondaryNavHeaderSlot` should be `null` when the panel owns the full sidebar body
- Use `useSecondaryNavSearchResultsOnly(true)` to suppress shell-registered nav links when the panel renders its own
- **Shell link geometry matches the space Work list** (`SpaceNavRow`): `rounded-[8px] px-2 py-0.5`, `size-7` icon slot with `size-5` glyph, active `bg-muted font-semibold`, hover `hover:bg-muted/60`. Section labels: `px-2 pb-1` + `text-xs uppercase tracking-wide`. Sections stack with `gap-3`. Settings / Setup use the same compact header as a space (`px-1`, no hairline, `icon-sm` toggle).

### Space Work tab agents

Pinned Engenties, then Inbox, then the unpinned Agents list. No agent **sections**. Pins are personal (`shell.spaces.agent_nav.v1`), not a mount grant.

- **Pinned tiles** sit above Inbox — Engenty ~48px, name under the character. No module / job-title pill. Omit the strip when there are no pins (no empty heading). Click opens the same desk as the list row.
- **Unpinned rows** are two-line: Engenty ~38px + name + relative timestamp on line 1; muted latest conversation title on line 2, tight leading (one block, not a title + caption). No module / job-title pill. No conversation → **New** pill (`spaces.agents.new`) where the timestamp would be, and no second line. Hover marquees overflowing line-2 text only (`SidebarRowTitleMarquee`; paint/overflow, row box stays still). Paint-only row hover (`hover:bg-muted/60`); no scale/translate on the character.
- **Overflow** is Lucide `MoreVertical` (`⋮`), revealed on row hover / `data-[state=open]` / `focus-visible`, same as Data-tree rows. Right-click opens the same trigger (`data-row-menu-trigger`). Menu: Pin/Unpin, Copy agent ID, Remove from space (hired, can manage). Do not add Move to, unread, duplicate, share, or hide.
- **Drag-sort** is within pins and within unpinned only — two independent `@dnd-kit` lists. Pointer distance constraint so a click still navigates. Drag does not pin or unpin.

### Knowledge Base module shell

- Hook: `useKbModuleSecondaryShellNav` — wires **`secondaryNavHeaderSlot`** (KB switcher), **`secondaryNavAfterItems`** (`KbSidebar` article tree + `KbModuleScopedNavLinks`), and **`kbRootCrumb`** for breadcrumbs.
- **`kbRootCrumb`:** KB picker as the first breadcrumb segment when the secondary column is **closed** and multiple KBs exist; **null** when the column is **open** so the switcher is not duplicated.
- **Routes:** Most KB pages use `contentStackBackground: "paper"` with `contentBlend` (see Page layout — warm canvas + blend). Full-bleed views (e.g. graph) may omit `contentStackBackground` for edge-to-edge canvas behavior.
- **Actions:** Primary add-source / adapter entry points live in **`KbModuleShellActions`** in the module topbar — do not duplicate that CTA in list toolbars.
- **Lists:** Toolbar filters and display toggles sit on the same **`bg-card`** canvas strip as the table/cards — **no** extra tinted “filter plate” behind the toolbar row.
- **Detail / hub UX:** Inline field chrome for titles and metadata (offers-style), hub hybrid search with a layout-stable swap to chat-style input for longer queries — hub search uses the [Hub hero search](#hub-hero-search) pill (not compact `h-8` fields); see `modules/knowledge-base/AGENTS.md` for copy and interaction specifics.

### Specialist start header

Agent desk empty chats (new conversation with a specialist) use a **compact identity header**, not a vertically centered splash greeting.

- **Placement:** identity block at the top of the chat column (`emptyLandingAlign: "start"`), on `--paper` with the transparent topbar overlapping (`topbarOverlap: true`). Identity + composer stay `max-w-[42rem]`. Do not `justify-center` this landing. `pt-11 sm:pt-12` clears the topbar. No tinted cover wash.
- **Engenty:** the agent's styleguide silhouette (`Engenty`, kinds in `ENGENTY_KINDS`) sits left of the title block. Preference lives on the agent (`engenty` in the form / `agent.json`); dynamic hires hash the agent id. The peeking composer uses the same kind.
- **Eyebrow + title lockup:** no gap between `engenty.` · role and the name. Against the 48px engenty: eyebrow is the top third (`text-xs leading-4`), title the lower two thirds (`text-[28px] leading-8`). Description sits below with `mt-2`.
- **Description:** the short catalog `description` only — `line-clamp-2`, muted `text-sm`. Never dump `instructions`.
- **Capabilities:** skill and connector chips in a single meta row (KB topline / FAQ tag pattern). Omit an empty group.
- Composer + starter pills sit under the header with a clear gap (`mt-14` / `md:mt-16`) so the peeking composer blob does not overlap skills. Starters align start, not centered.

Implementation: `AgentDeskIdentityHeader` in `packages/ai-ui` / `agent-desk-identity-header.tsx`.

### Specialist settings drawer

The agent desk settings overlay is a chat-side Sheet (`AgentDeskDrawer`), not `DocSidebarLayout`. Match **doc sidebar content density** (offers):

- Sheet inset: title row `px-4 py-3`; scroll body `px-4 pb-4` (no extra top pad under the title)
- Sections stack at `gap-5`
- `CardSection` with `headerVariant="compact"` (`font-semibold text-sm`, description `text-xs`) and `cardVariant` `compact` or `flush`
- Identity in the drawer is compact (40px Engenty, `text-lg` name) — the chat header keeps the 60px / page-title scale. Module agents put **`AgentModuleBadge`** after the name (same named pill as the desk header / roster). Do not put Specialist/Custom badges above the title.
- Custom-agent name and mandate use **`EditableText`** `variant="hover"`: no gray at rest, `bg-input/30` on field hover (and when empty, so the placeholder still reads as a field). No extra padding while editing.
- One card surface per section — do **not** nest `ui-card-elevated` inside `CardSection.Body`

### Spaces shell

- **Column header:** `SpaceNavHeader` (tile + name + chevron) in `secondaryNavHeaderOverride` — the column belongs to the space, not the module.
- **Collapsed breadcrumb:** the same switcher, `variant="breadcrumb"` (compact tile + name + chevron), as `secondaryNavRouteBreadcrumb`. Shown only while the secondary column is **closed**; omitted while it is **open** so the name is not duplicated. No leading `/` before the chooser (it sits next to the toggle like it did in the column header).
- **Rail overflow chooser:** when at least **two** spaces sit past the visible budget, a horizontal ellipsis (`⋯`, Lucide `MoreHorizontal`) opens a dropdown of every space. One leftover space stays a tile — do not bury a single place behind a menu. Do **not** unfold hidden tiles on hover (that moves `+` and everything below). The dashed **New space** (`+`) tile stays a sibling below the list and never opens the chooser.

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
- Divider between roles and recents: `border-t border-border-soft mx-2`

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
- Page must be scrollable: `flex min-h-0 flex-1 flex-col overflow-y-auto pb-scroll-safe`

---

## Cards & Info Sections

### Card padding (info/detail tabs)
- `py-2 px-0` on the `Card` element (8px vertical, no horizontal — let inner rows provide horizontal padding)
- Inner row container: `px-5 sm:px-6`
- No stacked card + page padding (`p-page` + `p-4` = double padding → avoid)
- One `Card` surface per `CardSection` / `SettingsFormSection` — no nested cards

### Key-value rows (contact info tab)
```tsx
// Row
"flex flex-col gap-1.5 py-3 sm:grid sm:grid-cols-[minmax(10rem,38%)_minmax(0,1fr)] sm:items-start sm:gap-x-8"
// Label
"text-muted-foreground text-sm font-normal leading-snug sm:pt-px"
// Value
"min-w-0 text-foreground text-sm font-normal leading-snug break-words"
```
Rows inside a card group: `divide-y divide-border-soft`

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

### Overflow / 3-dot menus
Use Lucide **`MoreVertical`** (vertical kebab `⋮`) for row and toolbar overflow (`TableRowActions`, `ListToolbar`). **Exception:** the compact rail overflow control uses **`MoreHorizontal`** (`⋯`) because the rail is a vertical list — a horizontal ellipsis reads as “more in this column.”

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

## Public landing (`apps/www`)

Marketing for the **self-hosted Fair Source** product. Same token file and type stack as the app; different density.

| | App (`apps/ui`) | Landing (`apps/www`) |
|---|---|---|
| Canvas | `--paper`, compact 14px rem on laptops | Full brand color bands, **16px rem always**, one `max-w-[84rem]` (1344px) container tuned for ~1400px screens |
| Display type | Page `h1` only (`28px`) | Hero headline `clamp(36px,4.6vw,68px)`; section headings 28px on a phone, `--t-display` from `sm`, `--t-display-l` from `lg` (Space Grotesk) |
| Engenties | Flat `Engenty` in chrome | Two sizes. **Large:** `FluffyEngenty` via `BigEngenty` — `coat="jelly"` (translucent gel, the current landing default) or `coat="fur"` (shell fur; `?coat=fur` on the landing compares them), both WebGL2 over the same metaball forms with the flat mark as fallback — the hero crew, the cast row, and the mark standing on each section heading; `medium` quality except the hero's `high`, slow paint-only float. **Never over a product mock** — a mock is the product, nothing sits on top of it. **Jelly look (locked):** colour comes from thickness — Beer–Lambert over the view chord, pale skin at the rim, the kind's colour at the core, a real shadow side; the highlight is a *paned window* reflected on the wet skin and on the glass eye (never a specular dot, never a hard white rim line); coverage ~0.5 at the rim to ~0.86 at the centre so the band shows through the edge only; a spring wobble overshoots the pointer lean. **Ground (locked):** under a jelly, a small dark contact shadow (`rgba(0,0,0,.38)`, ~46% of the body width, blur ~2.5% of the size) over a wide, faint wash in the kind's colour (~1.2× the width, blur ~16%, **opacity 0.14**). Never a screen-blended caustic (washes to white over paper), never a saturated or hard-edged colour pool. The fur keeps its white light pool. **On a heading** (`HeadlinePerch`): a jelly on section headings (`coat="jelly"`), the flat mark on small titles. It stands at the **end of the heading's first line**, measured after layout (`ResizeObserver` over one span per word) rather than named in the copy, so it follows a rewrap and both locales. Body height is a share of the heading's own font size (`ratio`, 1.4 for a jelly, 0.85 flat) and `perchBox` turns it into the box per kind and renderer, so an oval and a flame read the same size. The feet land on the cap line (`bottom: calc(50% + 0.25em - foot)`, `leading-[0]` or the line box adds descender space under it), centring is a **margin**, not a transform (the idle bob animates `transform`), and the word paints above the mark. The heading sits `mt-2` under its kicker — the mark needs room beside it, not a row above it. Inside mocks the flat mark at app sizes (24–40px), `animated={false}`. |
| Surfaces | `ui-card-*` on paper | Full accent fields (ember, amber, cobalt, moss, rose, plum, indigo, teal, olive, night, slate) with a soft white highlight blob (~12% opacity, heavy blur). Paper `ui-card-elevated` product mocks use `--r-5` and `.www-mock` drop shadow so they lift off the dark band, and `.www-mock` caps them at **1040px, centred** — a mock that runs the full 1344px container stops reading as an app window. `MockShell` drops the rail under `sm` and the secondary column under `md`, so a phone gets the canvas alone; a mock still taller than the phone (only the hero's) goes in `.www-crop`, which cuts it to 62svh and fades the bottom out, like a cropped screenshot. No hover translate. |
| Section height | Page scrolls as one | Every band below the hero is `ColorBand full`: `min-h-svh`, content centred in the viewport, `scroll-snap-align: start`. The page sets `scroll-snap-type: y proximity` and `scroll-padding-top: 4rem` (so bands also carry no `scroll-mt-*`); **never `mandatory`** — it fights a deliberate scroll. Both are **`lg` and up only**: under 1024px bands are content-height (`py-16`) and snapping is off, or a short band leaves a screen of empty colour |
| Scroll motion | None | `Reveal` entrance plus `Parallax` drift (`components/parallax.tsx`, one shared listener and frame; strength is px per half-viewport of travel, negative leads instead of lags): band highlight 140, big engenties 50–60, mocks 30, a feature band's heading column −18 so the two halves separate. Paint only, off under `prefers-reduced-motion` |
| Hover | Title underline on teasers | Pillar titles only (`group-hover:underline`). Never `hover:underline` on a wrapping `<a>` — that underlines the body too. |
| Ember band | Login left rail (`oklch(44% 0.16 30)`) | Hero + install CTA use that same deep ember; cream/white type; inverted white buttons |

Copy stays honest: GitHub + local setup, not a SaaS signup. Feature mocks are CSS chrome, not screenshots — `MockShell` follows the real shell (rail on paper, raised column, canvas; no layout hairlines), and every string in a mock comes from the locale so `/de` reads German.

---

## Compact UI Preferences

- Avoid unnecessary `h-*`, `px-*`, extra padding, and boxed wrapper surfaces around sidebar/menu areas — prefer direct-on-canvas layout
- `DropdownMenuGroup` with `my-0` separators: add `py-1` to prevent hover/divider collision
- Use **slim** shell topbar variant on Dashboard and aligned shell pages
- `contentBlend` pages: topbar height `h-10` for secondary column header row controls
