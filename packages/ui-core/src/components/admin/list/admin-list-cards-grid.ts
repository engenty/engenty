import { cn } from "../../../lib/utils";
import type { TableSize } from "../list-preferences/list-display-configurator";

/** Fluid columns: as many cards as fit at a minimum track width; `min(100%, …)` avoids overflow on narrow viewports. */
export function adminListCardsGridClassName(
  tableSize: TableSize = "normal"
): string {
  return cn(
    "grid",
    tableSize === "compact"
      ? "gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]"
      : "gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]"
  );
}
