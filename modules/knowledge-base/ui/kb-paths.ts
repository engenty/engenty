/**
 * Canonical URL builders: `/mdl/knowledge-base/kb/:slug/...`
 *
 * Legacy paths without `/kb/:slug` still work; pages redirect to these when possible.
 *
 * Copilot prompt copy for path patterns lives in
 * `packages/ai-core/src/agent-ui/app-navigation-paths-prompt.ts` — update both when routes change.
 */

/** Global module entry (multi-KB overview or redirect to single KB). */
export const KB_MODULE_BASE = "/mdl/knowledge-base";

/** Path segment between module base and knowledge base slug. */
export const KB_SCOPED_SEGMENT = "";

/** @deprecated Prefer {@link kbArticlesListPath} after resolving KB slug. */
export const KB_ARTICLES_LIST_PATH = `${KB_MODULE_BASE}/articles`;

/** @deprecated Prefer {@link kbFaqsListPath} after resolving KB slug. */
export const KB_FAQS_LIST_PATH = `${KB_MODULE_BASE}/faqs`;

/** Tenant-wide KB module settings (create KBs, embeddings, defaults). */
export const KB_MODULE_SETTINGS_PATH = "/settings/knowledge-base";

export function kbScopedRoot(slug: string): string {
  return `${KB_MODULE_BASE}/${encodeURIComponent(slug)}`;
}

export function kbHubPath(slug: string): string {
  return kbScopedRoot(slug);
}

/** KB hub edit page (`/kb/:slug/edit`). */
export function kbHubEditPath(slug: string): string {
  return `${kbScopedRoot(slug)}/edit`;
}

export function kbHubChatPath(slug: string): string {
  return `${kbScopedRoot(slug)}/chat`;
}

const KB_HUB_CHAT_PATH_RE = /^\/mdl\/knowledge-base\/[^/]+\/chat\/?$/;

/** Full-page KB hub chat (`/mdl/knowledge-base/kb/:slug/chat`). */
export function isKbHubChatRoute(pathname: string): boolean {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return KB_HUB_CHAT_PATH_RE.test(pathOnly);
}

/** Reserved `:id` segments on `/kb/:slug/:id` — use scoped hub/list routes instead. */
export const KB_SCOPED_RESERVED_ARTICLE_IDS = new Set([
  "articles",
  "browse",
  "c",
  "chat",
  "edit",
  "favorites",
  "faqs",
  "graph",
  "inbox",
  "new",
  "settings",
  "source-items",
  "sources",
  "templates",
]);

export function isKbScopedReservedArticleId(id: string | undefined): boolean {
  return KB_SCOPED_RESERVED_ARTICLE_IDS.has((id ?? "").trim().toLowerCase());
}

export function kbScopedSettingsPath(slug: string): string {
  return `${kbScopedRoot(slug)}/settings`;
}

/** Deep link to the article templates block on scoped KB settings. */
export function kbScopedSettingsTemplatesPath(slug: string): string {
  return `${kbScopedSettingsPath(slug)}#kb-article-templates`;
}

function kbTemplatesRouteBase(slug: string): string {
  return `${kbScopedRoot(slug)}/templates`;
}

export function kbTemplatePath(slug: string, templateId: string): string {
  const id = templateId.trim();
  if (!id) {
    return kbScopedSettingsTemplatesPath(slug);
  }
  return `${kbTemplatesRouteBase(slug)}/${encodeURIComponent(id)}`;
}

export function kbNewTemplatePath(slug: string): string {
  return `${kbTemplatesRouteBase(slug)}/new`;
}

export function kbArticlesListPath(slug: string): string {
  return `${kbScopedRoot(slug)}/articles`;
}

/** Category view page (`/kb/:slug/c/:catSlug`). */
export function kbCategoryPath(slug: string, categorySlug: string): string {
  return `${kbScopedRoot(slug)}/c/${encodeURIComponent(categorySlug)}`;
}

/** Category edit page (`/kb/:slug/c/:catSlug/edit`). */
export function kbCategoryEditPath(slug: string, categorySlug: string): string {
  return `${kbCategoryPath(slug, categorySlug)}/edit`;
}

export function kbBrowsePath(slug: string): string {
  return `${kbScopedRoot(slug)}/browse`;
}

export function kbGraphPath(slug: string): string {
  return `${kbScopedRoot(slug)}/graph`;
}

export function kbSourcesPath(slug: string): string {
  return `${kbScopedRoot(slug)}/sources`;
}

export function kbSourcePath(slug: string, sourceId: string): string {
  return `${kbScopedRoot(slug)}/sources/${encodeURIComponent(sourceId)}`;
}

export function kbSourceEditPath(slug: string, sourceId: string): string {
  return `${kbScopedRoot(slug)}/sources/${encodeURIComponent(sourceId)}/edit`;
}

export function kbSourceSetupPath(slug: string, sourceId: string): string {
  return `${kbScopedRoot(slug)}/sources/${encodeURIComponent(sourceId)}/setup`;
}

export function kbSourceItemPath(slug: string, itemId: string): string {
  return `${kbScopedRoot(slug)}/source-items/${encodeURIComponent(itemId)}`;
}

export function kbArticlePath(slug: string, articleIdOrSlug: string): string {
  return `${kbScopedRoot(slug)}/${articleIdOrSlug}`;
}

export function kbArticleEditPath(
  slug: string,
  articleIdOrSlug: string
): string {
  return `${kbScopedRoot(slug)}/${articleIdOrSlug}/edit`;
}

export function kbNewArticleEditPath(slug: string): string {
  return `${kbScopedRoot(slug)}/new/edit`;
}

/** New article editor with `parent` preset (maps to `parent_article_id` on save). */
export function kbNewArticleEditPathWithParent(
  slug: string,
  parentArticleId: string
): string {
  const q = new URLSearchParams();
  q.set("parent", parentArticleId);
  return `${kbNewArticleEditPath(slug)}?${q.toString()}`;
}

/** New article editor with `category` preset (maps to `category_id` on save). */
export function kbNewArticleEditPathWithCategory(
  slug: string,
  categoryId: string
): string {
  const q = new URLSearchParams();
  q.set("category", categoryId);
  return `${kbNewArticleEditPath(slug)}?${q.toString()}`;
}

export function kbFaqsListPath(slug: string): string {
  return `${kbScopedRoot(slug)}/faqs`;
}

export function kbFaqPath(slug: string, faqId: string): string {
  return `${kbScopedRoot(slug)}/faqs/${faqId}`;
}

export function kbFaqEditPath(slug: string, faqId: string): string {
  return `${kbScopedRoot(slug)}/faqs/${faqId}/edit`;
}

export function kbNewFaqEditPath(slug: string): string {
  return `${kbScopedRoot(slug)}/faqs/new/edit`;
}

export function kbInboxListPath(slug: string): string {
  return `${kbScopedRoot(slug)}/inbox`;
}

export function kbFavoritesListPath(slug: string): string {
  return `${kbScopedRoot(slug)}/favorites`;
}

export function kbInboxDetailPath(slug: string, inboxId: string): string {
  return `${kbScopedRoot(slug)}/inbox/${encodeURIComponent(inboxId)}`;
}

export function searchStringWithoutKbId(searchParams: URLSearchParams): string {
  const p = new URLSearchParams(searchParams);
  p.delete("kb_id");
  const s = p.toString();
  return s ? `?${s}` : "";
}
