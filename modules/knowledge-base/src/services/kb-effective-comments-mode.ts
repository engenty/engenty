import type { KbRepoFactory } from "../dal/contracts.js";
import type {
  KbCommentsModeBinding,
  KbEffectiveCommentsMode,
} from "../schema/comments.js";
import type { Article, KbCategory, KnowledgeBase } from "../schema/types.js";

function normalizeBinding(
  mode: KbCommentsModeBinding | null | undefined
): KbCommentsModeBinding {
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
      return mode;
    }
    current = current.parent_id
      ? (categories.find((row) => row.id === current!.parent_id) ?? null)
      : null;
  }
  return null;
}

export function resolveKbEffectiveCommentsModeFromData(
  kb: Pick<KnowledgeBase, "comments_mode">,
  categories: KbCategory[],
  article: Pick<Article, "category_id" | "comments_mode">
): KbEffectiveCommentsMode {
  const articleMode = normalizeBinding(article.comments_mode);
  if (articleMode !== "inherit") {
    return articleMode;
  }
  const category =
    categories.find((row) => row.id === article.category_id) ?? null;
  const fromCategory = resolveCategoryCommentsMode(categories, category);
  if (fromCategory) {
    return fromCategory;
  }
  return kb.comments_mode ?? "enabled";
}

export async function resolveKbEffectiveCommentsModeForArticle(
  repos: Pick<KbRepoFactory, "kb" | "categories">,
  article: Pick<Article, "kb_id" | "category_id" | "comments_mode">
): Promise<KbEffectiveCommentsMode> {
  const [kb, categories] = await Promise.all([
    repos.kb.getById(article.kb_id),
    repos.categories.list(article.kb_id),
  ]);
  if (!kb) {
    return "enabled";
  }
  return resolveKbEffectiveCommentsModeFromData(kb, categories, article);
}
