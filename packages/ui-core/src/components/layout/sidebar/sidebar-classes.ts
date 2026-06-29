/**
 * Shared class names for dense sidebar / nav trees (Notion-like hover chrome).
 */

/** Horizontal gutter for module secondary-nav column shell + panel body. */
export const sidebarColumnGutterClassName = "px-2";

/**
 * Extra left inset on column header `secondaryNavHeaderSlot` content so titles align
 * with panel body content (search fields, depth-0 row indent) on top of
 * {@link sidebarColumnGutterClassName} — gutter (8px) + inset (8px) = 16px.
 */
export const sidebarColumnContentInsetClassName = "pl-2";

/**
 * Extra right inset on column body menus and toolbars so truncated row titles
 * clear the resize handle — stacks on {@link sidebarColumnGutterClassName}.
 */
export const sidebarColumnContentInsetEndClassName = "pr-1";

/** Row actions overlay the title on hover/focus — no in-flow width when idle (full width for truncation). */
export const sidebarRowActionsOverlayClassName =
  "pointer-events-none absolute top-0 right-0 bottom-0 z-10 flex items-center gap-1 bg-gradient-to-l from-card from-45% to-transparent pl-6 pr-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100";

/** Leading icon column — chevron can swap in over the default icon (no extra left column). */
export const sidebarLeadingIconSlotClassName =
  "relative flex h-7 w-5 shrink-0 items-center justify-center";

/**
 * `padding-left` for a section label so its text lines up with `size-3.5` icons in
 * {@link sidebarLeadingIconSlotClassName} plus `pr-1`, when the sibling row uses `px-0.5` only.
 * Uses `(1rem - 0.875rem) / 2` for glyph inset because `w-5` is border-box and shares the box with `pr-1`.
 */
export const sidebarSectionLabelPlAlignToRowIconClassName =
  "pl-[calc(0.125rem+(1rem-0.875rem)/2)]";

/**
 * Same as {@link sidebarSectionLabelPlAlignToRowIconClassName} when rows use root
 * article indent `pl-2 pr-0.5` (matches {@link sidebarLeadingIconSlotClassName} rows).
 */
export const sidebarSectionLabelPlAlignToRootRowIconClassName =
  "pl-[calc(0.5rem+(1rem-0.875rem)/2)]";

/** Compact dropdown surface for tree row overflow menus. */
export const sidebarDenseMenuContentClassName =
  "min-w-[11.5rem] rounded-lg border bg-popover p-0.5 text-xs text-popover-foreground shadow-md";

export const sidebarDenseMenuLabelClassName =
  "px-2 pt-1 pb-0.5 font-semibold text-xxs text-muted-foreground uppercase tracking-wide";

export const sidebarDenseMenuItemClassName =
  "gap-2 rounded-md py-1 pr-2 pl-2 focus:bg-accent data-[highlighted]:bg-accent";

export const sidebarDenseMenuIconClassName = "h-4 w-4 shrink-0 opacity-70";
