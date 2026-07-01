import type { KbEffectiveCommentsMode } from "../../src/schema/comments.js";
import type {
  Article,
  KbCategory,
  KnowledgeBase,
} from "../../src/schema/types.js";

function normalizeBinding(mode: string | undefined): string {
  if (
    mode === "none" ||
    mode === "enabled" ||
    mode === "closed" ||
    mode === "inherit"
  ) {
    return mode;
  }
  return "inherit";
}

function resolveCategoryCommentsMode(
  categories: KbCategory[],
  category: KbCategory | null
): KbEffectiveCommentsMode | null {
  let current = category;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    const mode = normalizeBinding(current.comments_mode);
    if (mode !== "inherit") {
      return mode as KbEffectiveCommentsMode;
    }
    current = current.parent_id
      ? (categories.find((row) => row.id === current!.parent_id) ?? null)
      : null;
  }
  return null;
}

/** Client-side mirror of {@link resolveKbEffectiveCommentsModeForArticle}. */
export function resolveKbEffectiveCommentsModeClient(
  kb: Pick<KnowledgeBase, "comments_mode"> | null | undefined,
  categories: KbCategory[],
  article: Pick<Article, "category_id" | "comments_mode"> | null
): KbEffectiveCommentsMode {
  if (!(article && kb)) {
    return "enabled";
  }
  const articleMode = normalizeBinding(article.comments_mode);
  if (articleMode !== "inherit") {
    return articleMode as KbEffectiveCommentsMode;
  }
  const category =
    categories.find((row) => row.id === article.category_id) ?? null;
  const fromCategory = resolveCategoryCommentsMode(categories, category);
  if (fromCategory) {
    return fromCategory;
  }
  return kb.comments_mode ?? "enabled";
}

/** Prefer live category/KB cache over stale article detail payload. */
export function resolveArticleEffectiveCommentsMode(
  article: Pick<
    Article,
    "category_id" | "comments_mode" | "effective_comments_mode" | "kb_id"
  >,
  kb: Pick<KnowledgeBase, "comments_mode"> | null | undefined,
  categories: KbCategory[]
): KbEffectiveCommentsMode {
  if (kb && categories.length > 0) {
    return resolveKbEffectiveCommentsModeClient(kb, categories, article);
  }
  return article.effective_comments_mode ?? "enabled";
}
