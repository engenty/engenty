import type { useTranslation } from "@engenty/i18n/ui";
import type { KbCategoryCountDisplay } from "../../../src/schema/page-blocks.js";

export function categoryCountNeedsArticles(
  display: KbCategoryCountDisplay
): boolean {
  return display !== "none";
}

export function renderCategoryCountLabel(
  t: ReturnType<typeof useTranslation>["t"],
  direct: number,
  recursive: number,
  display: KbCategoryCountDisplay
): string | null {
  if (display === "none") {
    return null;
  }
  const count = display === "direct" ? direct : recursive;
  return t("page_blocks.categories.count", { count });
}
