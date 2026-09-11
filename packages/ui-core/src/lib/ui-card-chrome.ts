/**
 * Shared surface chrome class strings. Fill, radius, border, shadow, and hover
 * live on the CSS classes in `ui-canvas-chrome.css` — do not also add Tailwind
 * `border` / `bg-card` / `rounded-*` / `hover:bg-*` / `hover:shadow-*`.
 */

/** Grid / teaser / group card. */
export const uiCardRaisedClassName = "ui-card-raised" as const;

/** Primary list/table shell or standalone teaser. */
export const uiCardElevatedClassName = "ui-card-elevated" as const;

/** Settings / detail section card. */
export const uiCardPanelClassName = "ui-card-panel" as const;

/**
 * Hover deepen on a wrapping `div` (stretch-link hubs). Not needed when the
 * card element itself is `a` / `button` / `role=button`.
 */
export const uiCardInteractiveClassName = "ui-card-interactive" as const;

/** Row hover inside a white shell (folder lists). */
export const uiRowHoverClassName = "ui-row-hover" as const;

/**
 * Clickable status/teaser tile on paper (space-data roots, KB hub counts).
 * Layout (`flex` / `gap` / `p-4`) is part of this repeated pattern.
 */
export const uiStatusCardClassName =
  "ui-card-raised ui-card-interactive flex h-full flex-col gap-1 p-4" as const;
