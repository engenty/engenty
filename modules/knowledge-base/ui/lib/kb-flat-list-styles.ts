import { cn, focusVisibleRingOffset } from "@engenty/ui-core";
import {
  kbHubElevatedCardHoverClassName,
  kbHubElevatedSurfaceClassName,
} from "./kb-page-shell.js";

/** Flat KB hub / category list rows inside an elevated surface. */
export const kbFlatRowLinkClass = cn(
  "group/kb-row block min-w-0 rounded-sm px-3 py-2 text-left outline-none transition-colors hover:bg-muted/35 sm:px-4",
  focusVisibleRingOffset
);

/** Hub latest-updates row: title + comment chip + date on one line. */
export const kbFlatRowLinkFlexClass = cn(
  "group/kb-row flex min-w-0 items-center gap-2 rounded-sm px-3 py-2 text-left outline-none transition-colors hover:bg-muted/35 sm:gap-3 sm:px-4",
  focusVisibleRingOffset
);

export const kbFlatRowTitleClass =
  "truncate text-base text-foreground leading-snug group-hover/kb-row:underline";

export const kbFlatRowMetaClass = "text-muted-foreground text-xs";

/** List shell wrapping flat hub/category rows. */
export const kbFlatRowListClassName = cn(
  kbHubElevatedSurfaceClassName,
  "divide-y divide-border/50 py-1"
);

export const kbFlatTileLinkClass = cn(
  kbHubElevatedSurfaceClassName,
  kbHubElevatedCardHoverClassName,
  "group/kb-tile flex min-h-[5.5rem] min-w-0 flex-col gap-1.5 p-3 text-left outline-none sm:p-3.5",
  focusVisibleRingOffset
);

export const kbFlatTileTitleClass =
  "text-base font-medium text-foreground leading-snug group-hover/kb-tile:underline";

/** Topic teaser cards (KB hub + category sub-topics) on paper canvas. */
export const kbTopicTeaserCardLinkClass = cn(
  kbHubElevatedSurfaceClassName,
  kbHubElevatedCardHoverClassName,
  "group/kb-topic flex min-h-[5.5rem] min-w-0 flex-col gap-1.5 p-3 text-left outline-none sm:p-3.5",
  focusVisibleRingOffset
);

export const kbTopicTeaserTitleClass =
  "text-base font-medium text-foreground leading-snug group-hover/kb-topic:underline";

/** Multi-KB hub overview card. */
export const kbHubOverviewCardClassName = cn(
  kbHubElevatedSurfaceClassName,
  "space-y-2 p-4"
);
