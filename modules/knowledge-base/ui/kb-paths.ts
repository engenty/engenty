/**
 * Canonical URL builders: `/mdl/knowledge-base/...`
 *
 * A space has exactly one knowledge base, so no URL names a library — the
 * space the page is opened in (`/s/<key>/kb/...`, mirrored from
 * these module paths) already says which one.
 *
 * Copilot prompt copy for path patterns lives in
 * `packages/ai-core/src/agent-ui/app-navigation-paths-prompt.ts` — update both when routes change.
 */

/** Module entry: the space's knowledge base hub. */
export const KB_MODULE_ID = "knowledge-base";
export const KB_MODULE_BASE = `/mdl/${KB_MODULE_ID}`;

/** Tenant-wide KB module settings (embedding model, retrieval quality). */
export const KB_MODULE_SETTINGS_PATH = "/settings/knowledge-base";

export function kbHubPath(): string {
  return KB_MODULE_BASE;
}

export function kbHubEditPath(): string {
  return `${KB_MODULE_BASE}/edit`;
}

export function kbHubChatPath(): string {
  return `${KB_MODULE_BASE}/chat`;
}

const KB_HUB_CHAT_PATH_RE = /^\/mdl\/knowledge-base\/chat\/?$/;

/** Full-page KB hub chat (`/mdl/knowledge-base/chat`). */
export function isKbHubChatRoute(pathname: string): boolean {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return KB_HUB_CHAT_PATH_RE.test(pathOnly);
}

/** Reserved `:id` segments on `/mdl/knowledge-base/:id` — hub/list routes, never an article. */
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

export function kbScopedSettingsPath(): string {
  return `${KB_MODULE_BASE}/settings`;
}

/** Deep link to the article templates block on the KB settings page. */
export function kbScopedSettingsTemplatesPath(): string {
  return `${kbScopedSettingsPath()}#kb-article-templates`;
}

function kbTemplatesRouteBase(): string {
  return `${KB_MODULE_BASE}/templates`;
}

export function kbTemplatePath(templateId: string): string {
  const id = templateId.trim();
  if (!id) {
    return kbScopedSettingsTemplatesPath();
  }
  return `${kbTemplatesRouteBase()}/${encodeURIComponent(id)}`;
}

export function kbNewTemplatePath(): string {
  return `${kbTemplatesRouteBase()}/new`;
}

export function kbArticlesListPath(): string {
  return `${KB_MODULE_BASE}/articles`;
}

/** Category view page (`/c/:catSlug`). */
export function kbCategoryPath(categorySlug: string): string {
  return `${KB_MODULE_BASE}/c/${encodeURIComponent(categorySlug)}`;
}

/** Category edit page (`/c/:catSlug/edit`). */
export function kbCategoryEditPath(categorySlug: string): string {
  return `${kbCategoryPath(categorySlug)}/edit`;
}

export function kbBrowsePath(): string {
  return `${KB_MODULE_BASE}/browse`;
}

export function kbGraphPath(): string {
  return `${KB_MODULE_BASE}/graph`;
}

export function kbSourcesPath(): string {
  return `${KB_MODULE_BASE}/sources`;
}

export function kbSourcePath(sourceId: string): string {
  return `${KB_MODULE_BASE}/sources/${encodeURIComponent(sourceId)}`;
}

export function kbSourceEditPath(sourceId: string): string {
  return `${kbSourcePath(sourceId)}/edit`;
}

export function kbSourceSetupPath(sourceId: string): string {
  return `${kbSourcePath(sourceId)}/setup`;
}

export function kbSourceItemPath(itemId: string): string {
  return `${KB_MODULE_BASE}/source-items/${encodeURIComponent(itemId)}`;
}

export function kbArticlePath(articleIdOrSlug: string): string {
  return `${KB_MODULE_BASE}/${articleIdOrSlug}`;
}

export function kbArticleEditPath(articleIdOrSlug: string): string {
  return `${KB_MODULE_BASE}/${articleIdOrSlug}/edit`;
}

export function kbNewArticleEditPath(): string {
  return `${KB_MODULE_BASE}/new/edit`;
}

/** New article editor with `parent` preset (maps to `parent_article_id` on save). */
export function kbNewArticleEditPathWithParent(
  parentArticleId: string
): string {
  const q = new URLSearchParams();
  q.set("parent", parentArticleId);
  return `${kbNewArticleEditPath()}?${q.toString()}`;
}

/** New article editor with `category` preset (maps to `category_id` on save). */
export function kbNewArticleEditPathWithCategory(categoryId: string): string {
  const q = new URLSearchParams();
  q.set("category", categoryId);
  return `${kbNewArticleEditPath()}?${q.toString()}`;
}

export function kbFaqsListPath(): string {
  return `${KB_MODULE_BASE}/faqs`;
}

export function kbFaqPath(faqId: string): string {
  return `${KB_MODULE_BASE}/faqs/${faqId}`;
}

export function kbFaqEditPath(faqId: string): string {
  return `${kbFaqPath(faqId)}/edit`;
}

export function kbNewFaqEditPath(): string {
  return `${KB_MODULE_BASE}/faqs/new/edit`;
}

export function kbInboxListPath(): string {
  return `${KB_MODULE_BASE}/inbox`;
}

export function kbFavoritesListPath(): string {
  return `${KB_MODULE_BASE}/favorites`;
}

export function kbInboxDetailPath(inboxId: string): string {
  return `${kbInboxListPath()}/${encodeURIComponent(inboxId)}`;
}
