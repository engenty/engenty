import type { KbCategoryCountDisplay } from "../../../src/schema/page-blocks.js";

export function categoryCountNeedsArticles(
  display: KbCategoryCountDisplay
): boolean {
  return display !== "none";
}

export function renderCategoryCountLabel(
  t: (key: string, options?: { count?: number }) => string,
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
