import { adminListCardsGridClassName } from "@engenty/ui-core";

export function articleCardsGridWrapperClassName(
  tableSize: "compact" | "normal"
): string {
  return adminListCardsGridClassName(tableSize);
}
