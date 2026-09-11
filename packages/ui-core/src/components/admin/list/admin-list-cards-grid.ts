import { cn } from "../../../lib/utils";
import type { TableSize } from "../list-preferences/list-display-configurator";

/**
 * Fluid columns: as many cards as fit at a minimum track width; `min(100%, …)`
 * avoids overflow on narrow viewports.
 *
 * `minTrack` widens the cards for lists whose primary content is prose. A skill
 * or a flow is chosen by reading what it does, and at the default track a long
 * name and its slug truncate against each other; a catalog of short labels
 * (tools, files) reads better dense. Pass a wider value rather than raising the
 * default, so those stay as they are.
 */
// Literal class strings, never interpolated: Tailwind scans source statically,
// so a class assembled at runtime (`minmax(min(100%,${x}),1fr)`) produces no CSS
// at all and the grid silently collapses to one column.
const TRACK_CLASS = {
  compact:
    "[grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]",
  normal:
    "[grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]",
  wide: "[grid-template-columns:repeat(auto-fill,minmax(min(100%,26rem),1fr))]",
} as const;

export function adminListCardsGridClassName(
  tableSize: TableSize = "normal",
  options?: { track?: "default" | "wide" }
): string {
  return cn(
    "grid",
    tableSize === "compact" ? "gap-2" : "gap-3",
    options?.track === "wide"
      ? TRACK_CLASS.wide
      : TRACK_CLASS[tableSize === "compact" ? "compact" : "normal"]
  );
}
