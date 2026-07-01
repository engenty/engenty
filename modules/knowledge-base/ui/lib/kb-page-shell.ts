/**
 * Module-wide page shells for KB routes inside `CopilotShellMain` (`overflow-hidden`).
 * Each page needs `flex-1 min-h-0` and an explicit scroll container.
 */

/** Single outer scroll container — `p-page` lives here. */
export const kbModulePageShellSectionClassName =
  "flex min-h-0 flex-1 flex-col overflow-y-auto p-page";

/** Inner centered column (source item detail, edit forms). */
export const kbModulePageShellInnerClassName =
  "mx-auto flex w-full max-w-5xl flex-col gap-6";

/** Inner centered column — article / FAQ width. */
export const kbModulePageShellInnerNarrowClassName =
  "mx-auto flex w-full max-w-3xl flex-col gap-6";

/** Inner centered column — hub / source detail tab body (DESIGN.md: max-w-5xl). */
export const kbModulePageShellInnerWideClassName =
  "mx-auto flex w-full max-w-5xl flex-col gap-6";

/** KB hub / category scroll body — warm paper canvas, centered column. */
export const kbModuleHubContentInnerClassName =
  "mx-auto w-full max-w-5xl space-y-8 p-page pb-10";

/** Cover band header row — aligns with hub content column (`p-page` horizontal inset). */
export const kbModuleHubCoverInnerClassName =
  "mx-auto flex w-full max-w-5xl items-end justify-between gap-3 p-page pb-3 pt-0";

/** Section headings on hub / category pages (DESIGN.md type scale). */
export const kbHubSectionHeadingClassName =
  "font-heading font-semibold text-lg leading-7 tracking-tight text-foreground";

/** Elevated card hover on `--paper` — paint-only; shadow deepens in place (DESIGN.md). */
export const kbHubElevatedCardHoverClassName =
  "bg-card transition-[box-shadow] duration-150 ease-out hover:shadow-[var(--e-3)]";

/** Elevated list/card shell on paper canvas (DESIGN.md ui-canvas-elevated). */
export const kbHubElevatedSurfaceClassName =
  "ui-canvas-elevated overflow-hidden rounded-lg border-0 bg-card";

/** KB hub hero search height (DESIGN.md — prominent pill, not h-8 form fields). */
export const KB_HUB_HERO_SEARCH_HEIGHT_PX = 44;

/** Prominent hub search input on warm paper canvas. */
export const kbHubHeroSearchInputClassName =
  "flex h-11 w-full rounded-full border border-input bg-card pr-3 pl-10 text-sm shadow-ember-elevated outline-none transition-[border-color,box-shadow]";

/** Autocomplete panel under hub hero search — inset so corners clear the pill. */
export const kbHubHeroSearchSuggestPanelClassName =
  "ui-canvas-floating absolute inset-x-3 top-[calc(100%+0.375rem)] z-20 rounded-xl border bg-card text-foreground shadow-md";

/**
 * List shells: outer clips height; toolbar stays fixed; table/card area scrolls
 * via `AdminListTableView` / `AdminListCardsView`.
 */
export const kbModulePageListShellSectionClassName =
  "flex min-h-0 flex-1 flex-col overflow-hidden p-page";

/** Hub / category pages that scroll via `ScrollArea` on the section child. */
export const kbModulePageScrollAreaShellSectionClassName =
  "flex min-h-0 flex-1 flex-col overflow-hidden";

/** Full-bleed layouts (graph canvas, hub chat) — no `p-page` on the section root. */
export const kbModulePageFillShellSectionClassName =
  "flex min-h-0 flex-1 flex-col overflow-hidden";
