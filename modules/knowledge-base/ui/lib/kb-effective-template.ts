import type {
  Article,
  KbArticleTemplate,
  KbCategory,
  KbTemplateBindingMode,
} from "../../src/schema/types.js";

function normalizeMode(mode: KbTemplateBindingMode | null | undefined) {
  return mode === "none" || mode === "template" ? mode : "inherit";
}

function resolveCategoryTemplate(
  categories: KbCategory[],
  templates: KbArticleTemplate[],
  category: KbCategory | null
): KbArticleTemplate | null {
  const byId = new Map(categories.map((row) => [row.id, row]));
  let current = category;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    const mode = normalizeMode(current.template_mode);
    if (mode === "none") {
      return null;
    }
    if (mode === "template") {
      return templates.find((row) => row.id === current!.template_id) ?? null;
    }
    current = current.parent_id ? (byId.get(current.parent_id) ?? null) : null;
  }
  return null;
}

/** Client-side mirror of {@link resolveKbTemplateForArticle} for edit-page labels. */
export function resolveKbEffectiveTemplateClient(
  categories: KbCategory[],
  templates: KbArticleTemplate[],
  article: Pick<Article, "category_id" | "template_id" | "template_mode"> | null
): KbArticleTemplate | null {
  if (!article) {
    return null;
  }
  const mode = normalizeMode(article.template_mode);
  if (mode === "none") {
    return null;
  }
  if (mode === "template") {
    return templates.find((row) => row.id === article.template_id) ?? null;
  }
  const category =
    categories.find((row) => row.id === article.category_id) ?? null;
  return resolveCategoryTemplate(categories, templates, category);
}

/** Resolved template for a category binding (walks parent chain on inherit). */
export function resolveKbEffectiveTemplateForCategoryClient(
  categories: KbCategory[],
  templates: KbArticleTemplate[],
  category: Pick<
    KbCategory,
    "id" | "parent_id" | "template_id" | "template_mode"
  > | null
): KbArticleTemplate | null {
  if (!category) {
    return null;
  }
  const mode = normalizeMode(category.template_mode);
  if (mode === "none") {
    return null;
  }
  if (mode === "template") {
    return templates.find((row) => row.id === category.template_id) ?? null;
  }
  const byId = new Map(categories.map((row) => [row.id, row]));
  const parent = category.parent_id
    ? (byId.get(category.parent_id) ?? null)
    : null;
  return resolveCategoryTemplate(categories, templates, parent);
}
