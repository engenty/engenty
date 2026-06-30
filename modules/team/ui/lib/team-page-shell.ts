/**
 * Team module page shells inside `CopilotShellMain` (`overflow-hidden`).
 * Each route needs `flex-1 min-h-0` and an explicit scroll container.
 */

/** Single outer scroll container — inner wrappers carry `p-page`. */
export const teamModulePageScrollShellClassName =
  "flex min-h-0 flex-1 flex-col overflow-y-auto";

/** Centered form/detail column (edit, detail). */
export const teamModulePageScrollInnerClassName =
  "mx-auto w-full max-w-4xl space-y-6 p-page pb-10";

/** Settings and other narrow forms. */
export const teamModulePageScrollInnerNarrowClassName =
  "mx-auto w-full max-w-3xl space-y-8 p-page pb-10";

/**
 * List shells: outer clips height; toolbar stays fixed; table/card area scrolls
 * via list table components.
 */
export const teamModulePageListShellSectionClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-page";

/** Full-bleed scroll (agents grid) — padding on the scroll root. */
export const teamModulePageScrollPaddedShellClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-page pb-10";

/** Full-bleed layouts (org graph) — no page padding on the section root. */
export const teamModulePageFillShellSectionClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-page";
