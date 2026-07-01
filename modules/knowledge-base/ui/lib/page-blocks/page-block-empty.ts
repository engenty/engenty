import type {
  KbPageArticlesBlock,
  KbPageBlock,
  KbPageContentBlock,
  KbPageFaqsBlock,
} from "../../../src/schema/page-blocks.js";
import type { Article, Faq, KbCategory } from "../../../src/schema/types.js";
import { resolveArticlesForBlock } from "./resolve-articles-for-block.js";
import { resolveCategoriesForBlock } from "./resolve-categories-for-block.js";

export function jsonIsEmptyDoc(
  json: Record<string, unknown> | null | undefined
): boolean {
  if (!json) {
    return true;
  }
  const content = json.content;
  if (!Array.isArray(content) || content.length === 0) {
    return true;
  }
  return content.every((node) => {
    if (!node || typeof node !== "object") {
      return true;
    }
    const inner = (node as { content?: unknown[] }).content;
    if (!Array.isArray(inner) || inner.length === 0) {
      return true;
    }
    return inner.every((leaf) => {
      if (!leaf || typeof leaf !== "object") {
        return true;
      }
      const text = (leaf as { text?: string }).text;
      return typeof text !== "string" || text.trim().length === 0;
    });
  });
}

export function isKbPageContentBlockEmpty(block: KbPageContentBlock): boolean {
  if (block.content_markdown?.trim()) {
    return false;
  }
  return jsonIsEmptyDoc(block.content_json);
}

export function isKbPageCategoriesBlockEmpty(
  block: Extract<KbPageBlock, { type: "categories" }>,
  categories: KbCategory[],
  parentCategoryId: string | null
): boolean {
  return (
    resolveCategoriesForBlock(block, { categories, parentCategoryId })
      .length === 0
  );
}

export function isKbPageArticlesBlockEmpty(
  block: KbPageArticlesBlock,
  allArticles: Article[],
  categories: KbCategory[],
  categoryId?: string
): boolean {
  return (
    resolveArticlesForBlock({
      block,
      allArticles,
      categories,
      categoryId,
    }).length === 0
  );
}

export function isKbPageFaqsBlockEmpty(
  block: KbPageFaqsBlock,
  allFaqs: Faq[]
): boolean {
  if (block.include_drafts) {
    return allFaqs.length === 0;
  }
  return allFaqs.filter((faq) => faq.status === "published").length === 0;
}

export function faqsQueryParamsForBlock(block: KbPageFaqsBlock, kbId: string) {
  return {
    kb_id: kbId,
    page_size: block.max_items,
    sort_by: "sort_order" as const,
    sort_order: "asc" as const,
    ...(block.include_drafts ? {} : { status: "published" as const }),
  };
}

export function articlesQueryParamsForBlock(
  block: KbPageArticlesBlock,
  kbId: string,
  categoryId?: string
) {
  const isRecursive =
    block.source === "latest_created_recursive" ||
    block.source === "recent_updated_recursive";

  return {
    kb_id: kbId,
    category_id:
      categoryId &&
      !isRecursive &&
      block.source !== "manual_pick" &&
      block.source !== "grouped_by_category"
        ? categoryId
        : undefined,
    page_size:
      isRecursive || block.source === "manual_pick" ? 500 : block.max_items,
    template_property_filters: block.property_filters,
    sort_by:
      block.source === "latest_created" ||
      block.source === "latest_created_recursive"
        ? ("created_at" as const)
        : block.source === "recent_updated" ||
            block.source === "recent_updated_recursive"
          ? ("updated_at" as const)
          : block.sort_by,
    sort_order:
      block.source === "latest_created" ||
      block.source === "recent_updated" ||
      block.source === "latest_created_recursive" ||
      block.source === "recent_updated_recursive"
        ? ("desc" as const)
        : ("asc" as const),
  };
}
