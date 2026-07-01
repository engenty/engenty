import type { ArticleUpdateInput } from "../schema/articles.js";
import type { Article, Faq } from "../schema/types.js";

/**
 * Serializable snapshot of an article for `module_kb.article_versions.snapshot`.
 */
export function articleToVersionSnapshot(
  article: Article
): Record<string, unknown> {
  return {
    title: article.title,
    slug: article.slug,
    status: article.status,
    kb_id: article.kb_id,
    parent_article_id: article.parent_article_id,
    content_markdown: article.content_markdown,
    content_json: article.content_json,
    summary: article.summary,
    questions_answered: article.questions_answered,
    sort_order: article.sort_order,
    custom_properties: article.custom_properties,
    original_document_url: article.original_document_url,
    original_document_name: article.original_document_name,
    tag_ids: article.tags?.map((t) => t.id) ?? [],
  };
}

export interface ArticleRestoreFromSnapshot {
  patch: ArticleUpdateInput;
  tag_ids?: string[];
}

/** Map a stored version snapshot back into an article update payload. */
export function articleSnapshotToRestorePatch(
  snapshot: Record<string, unknown>
): ArticleRestoreFromSnapshot | null {
  const title = snapshot.title;
  if (typeof title !== "string" || !title.trim()) {
    return null;
  }
  const patch: ArticleUpdateInput = { title: title.trim() };
  if (typeof snapshot.slug === "string" && snapshot.slug.trim()) {
    patch.slug = snapshot.slug.trim();
  }
  if (
    snapshot.status === "draft" ||
    snapshot.status === "published" ||
    snapshot.status === "archived"
  ) {
    patch.status = snapshot.status;
  }
  if (
    snapshot.parent_article_id === null ||
    typeof snapshot.parent_article_id === "string"
  ) {
    patch.parent_article_id = snapshot.parent_article_id;
  }
  if (
    snapshot.content_markdown === null ||
    typeof snapshot.content_markdown === "string"
  ) {
    patch.content_markdown = snapshot.content_markdown;
  }
  if (
    snapshot.content_json === null ||
    (typeof snapshot.content_json === "object" &&
      snapshot.content_json !== null)
  ) {
    patch.content_json = snapshot.content_json as Record<
      string,
      unknown
    > | null;
  }
  if (snapshot.summary === null || typeof snapshot.summary === "string") {
    patch.summary = snapshot.summary;
  }
  if (Array.isArray(snapshot.questions_answered)) {
    patch.questions_answered = snapshot.questions_answered.filter(
      (q): q is string => typeof q === "string"
    );
  }
  if (typeof snapshot.sort_order === "number") {
    patch.sort_order = snapshot.sort_order;
  }
  if (
    snapshot.original_document_url === null ||
    typeof snapshot.original_document_url === "string"
  ) {
    patch.original_document_url = snapshot.original_document_url;
  }
  if (
    snapshot.original_document_name === null ||
    typeof snapshot.original_document_name === "string"
  ) {
    patch.original_document_name = snapshot.original_document_name;
  }
  if (
    snapshot.custom_properties &&
    typeof snapshot.custom_properties === "object" &&
    !Array.isArray(snapshot.custom_properties)
  ) {
    patch.custom_properties = snapshot.custom_properties as Record<
      string,
      string | number | null
    >;
  }
  const tag_ids = Array.isArray(snapshot.tag_ids)
    ? snapshot.tag_ids.filter((id): id is string => typeof id === "string")
    : undefined;
  return { patch, ...(tag_ids?.length ? { tag_ids } : {}) };
}

/**
 * Serializable snapshot of a FAQ for `module_kb.faq_versions.snapshot`.
 */
export function faqToVersionSnapshot(faq: Faq): Record<string, unknown> {
  return {
    question: faq.question,
    status: faq.status,
    kb_id: faq.kb_id,
    answer_json: faq.answer_json,
    answer_markdown: faq.answer_markdown,
    sort_order: faq.sort_order,
    tag_ids: faq.tags?.map((t) => t.id) ?? [],
  };
}
