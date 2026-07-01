/**
 * Knowledge Base — DAL contracts (repository interfaces).
 */

import type {
  Article,
  ArticleComment,
  ArticleInput,
  ArticlesQueryParams,
  ArticleUpdateInput,
  Attachment,
  AttachmentInput,
  Faq,
  FaqInput,
  FaqsQueryParams,
  FaqUpdateInput,
  InboxItem,
  InboxItemInput,
  InboxItemUpdateInput,
  InboxQueryParams,
  KbActivityLogEntry,
  KbArticleTemplate,
  KbArticleTemplateInput,
  KbArticleTemplateUpdateInput,
  KbCategory,
  KbCategoryInput,
  KbCategoryUpdateInput,
  KbDisplay,
  KbGraphInlineLink,
  KbGraphNode,
  KbPageLayoutSettings,
  KbSettings,
  KbSettingsInput,
  KbSource,
  KbSourceInput,
  KbSourceItem,
  KbSourceItemInput,
  KbSourceItemLink,
  KbSourceItemLinkInput,
  KbSourceItemListQueryParams,
  KbSourceItemMedia,
  KbSourceItemMediaInput,
  KbSourceItemSection,
  KbSourceItemSectionInput,
  KbSourceItemUpdateInput,
  KbSourceListQueryParams,
  KbSourceRun,
  KbSourceRunInput,
  KbSourceRunUpdateInput,
  KbSourceUpdateInput,
  KnowledgeBase,
  KnowledgeBaseInput,
  KnowledgeBaseUpdateInput,
  PaginatedResponse,
  SourceReference,
  Tag,
  TagInput,
} from "../schema/types.js";
import type { KbVersionRepo } from "./kb-versions.js";

// `EmitArticleEvent` decouples the DAL from the plugin events runtime. The
// repo factory wires a real emitter that forwards to
// `engenty.events.modules.emit("knowledge-base.article.<verb>", ...)`; the
// SDK declarative re-index binding then routes those into the search
// provider's `replaceDocument` / `deleteDocument` paths.
export type EmitArticleEvent = (
  verb: "created" | "deleted" | "updated",
  payload: {
    article_id: string;
    kb_id?: string;
    scope_id: string;
    tenant_id: string;
  }
) => void | Promise<void>;

// `knowledge-base.category.<verb>` — folder-tree changes. Consumed by the
// `kb-filesystem-sync` module to keep the OKF `<category-slug>/index.md`
// representation (and child file prefixes) in step with the DB.
export type EmitCategoryEvent = (
  verb: "created" | "deleted" | "updated",
  payload: {
    category_id: string;
    kb_id: string;
    scope_id: string;
    tenant_id: string;
  }
) => void | Promise<void>;

// `knowledge-base.kb.<verb>` — KB configuration changes. Drives the OKF root
// `/index.md` file in the sync module.
export type EmitKbEvent = (
  verb: "created" | "deleted" | "updated",
  payload: {
    kb_id: string;
    scope_id: string;
    tenant_id: string;
  }
) => void | Promise<void>;

// Per-tenant factory closure built once in `src/plugin.ts` (with the live
// `emitArticleEvent` wired in). Routes, gateway operations, and the search
// provider's `resolveRepos` all consume this so every repo touch is on the
// same emit-aware path.
export type KbRepoFactoryFn = (
  tenantId: string,
  scopeId: string
) => KbRepoFactory;

/* ── Knowledge Base Repo ── */

export interface KbRepo {
  create(input: KnowledgeBaseInput): Promise<KnowledgeBase>;
  delete(id: string): Promise<boolean>;
  getById(id: string): Promise<KnowledgeBase | null>;
  getDefault(): Promise<KnowledgeBase | null>;
  list(): Promise<KnowledgeBase[]>;
  update(
    id: string,
    input: KnowledgeBaseUpdateInput
  ): Promise<KnowledgeBase | null>;
}

export interface KbTemplateRepo {
  create(input: KbArticleTemplateInput): Promise<KbArticleTemplate>;
  delete(id: string): Promise<boolean>;
  getById(id: string): Promise<KbArticleTemplate | null>;
  list(kbId: string): Promise<KbArticleTemplate[]>;
  update(
    id: string,
    input: KbArticleTemplateUpdateInput
  ): Promise<KbArticleTemplate | null>;
}

export interface ArticleCommentRepo {
  countByArticle(articleId: string): Promise<number>;
  countByArticleIds(articleIds: string[]): Promise<Map<string, number>>;
  create(
    articleId: string,
    content: string,
    createdBy: string | null
  ): Promise<ArticleComment>;
  delete(id: string): Promise<boolean>;
  getById(id: string): Promise<ArticleComment | null>;
  listByArticle(articleId: string): Promise<ArticleComment[]>;
  update(id: string, content: string): Promise<ArticleComment | null>;
}

/* ── Article Repo ── */

export interface ArticleNavigationContext {
  next: { id: string; title: string; slug: string } | null;
  parent_chain: Array<{ id: string; title: string; slug: string }>;
  prev: { id: string; title: string; slug: string } | null;
  /** First page in KB reading order — UI should offer previous step to the KB hub. */
  prev_to_hub?: boolean;
}

export interface KbArticleFtsSuggestion {
  headline: string;
  id: string;
  kb_id: string;
  rank: number;
  slug: string;
  title: string;
}

export interface ArticleActorContext {
  principalId: string;
}

export interface ArticleRepo {
  create(
    input: ArticleInput,
    tagIds?: string[],
    actor?: ArticleActorContext | null
  ): Promise<Article>;
  delete(id: string): Promise<boolean>;
  getById(id: string, kbIdOrSlug?: string): Promise<Article | null>;
  getByOriginalDocumentUrl(kbId: string, url: string): Promise<Article | null>;
  getNavigationContext(id: string): Promise<ArticleNavigationContext | null>;
  /** Lightweight slug lookup for frontmatter / parent display. */
  getSlugById(id: string): Promise<string | null>;
  listAllForGraph(kbId: string): Promise<KbGraphNode[]>;
  listArticleIdsPaginated(params: {
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<{ id: string }>>;
  /** Inline article→article links parsed from `content_json` link marks (same KB only). */
  listInlineLinksForGraph(kbId: string): Promise<KbGraphInlineLink[]>;
  listPaginated(
    params: ArticlesQueryParams
  ): Promise<PaginatedResponse<Article>>;
  restoreFromVersion(
    id: string,
    version: number,
    actor?: ArticleActorContext | null
  ): Promise<Article | null>;
  setTags(articleId: string, tagIds: string[]): Promise<void>;
  suggestFts(
    kbId: string,
    query: string,
    limit: number
  ): Promise<KbArticleFtsSuggestion[]>;
  update(
    id: string,
    input: ArticleUpdateInput,
    tagIds?: string[],
    actor?: ArticleActorContext | null
  ): Promise<Article | null>;
}

/* ── Category Repo ── */

export interface CategoryRepo {
  create(input: KbCategoryInput): Promise<KbCategory>;
  delete(id: string): Promise<boolean>;
  getById(id: string): Promise<KbCategory | null>;
  /** Returns the seeded `general` category for the KB (always present per migration). */
  getDefaultForKb(kbId: string): Promise<KbCategory | null>;
  list(kbId: string): Promise<KbCategory[]>;
  update(id: string, input: KbCategoryUpdateInput): Promise<KbCategory | null>;
}

/* ── Tag Repo ── */

export interface TagRepo {
  create(input: TagInput): Promise<Tag>;
  delete(id: string): Promise<boolean>;
  getById(id: string): Promise<Tag | null>;
  list(kbId: string): Promise<Tag[]>;
}

/* ── Attachment Repo ── */

export interface AttachmentRepo {
  create(input: AttachmentInput): Promise<Attachment>;
  delete(id: string): Promise<boolean>;
  listByArticle(articleId: string): Promise<Attachment[]>;
}

/* ── FAQ Repo ── */

export interface FaqActorContext {
  principalId: string;
}

export interface FaqRepo {
  create(
    input: FaqInput,
    tagIds?: string[],
    actor?: FaqActorContext | null
  ): Promise<Faq>;
  delete(id: string): Promise<boolean>;
  getById(id: string): Promise<Faq | null>;
  listPaginated(params: FaqsQueryParams): Promise<PaginatedResponse<Faq>>;
  setTags(faqId: string, tagIds: string[]): Promise<void>;
  update(
    id: string,
    input: FaqUpdateInput,
    tagIds?: string[],
    actor?: FaqActorContext | null
  ): Promise<Faq | null>;
}

/* ── Inbox (raw capture) ── */

export interface InboxRepo {
  create(
    input: InboxItemInput,
    actorPrincipalId?: string | null
  ): Promise<InboxItem>;
  delete(id: string): Promise<boolean>;
  getById(id: string): Promise<InboxItem | null>;
  listPaginated(
    params: InboxQueryParams
  ): Promise<PaginatedResponse<InboxItem>>;
  update(id: string, input: InboxItemUpdateInput): Promise<InboxItem | null>;
}

export interface SourceReferenceRepo {
  create(
    input: Pick<
      SourceReference,
      | "article_id"
      | "faq_id"
      | "inbox_item_id"
      | "excerpt"
      | "locator"
      | "source_url"
      | "original_storage_path"
    >
  ): Promise<SourceReference>;
  /** Deletes rows matching inbox + article (used for promote-batch rollback). */
  deleteByInboxAndArticle(
    inboxItemId: string,
    articleId: string
  ): Promise<void>;
  listByArticle(articleId: string): Promise<SourceReference[]>;
}

export interface KbActivityLogRepo {
  append(entry: {
    actor_id?: string | null;
    event_type: string;
    kb_id?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<KbActivityLogEntry>;
  listPaginated(params: {
    kb_id?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<KbActivityLogEntry>>;
}

/* ── Dynamic sources ── */

export interface KbSourceRepo {
  create(
    input: KbSourceInput,
    actorPrincipalId?: string | null
  ): Promise<KbSource>;
  createRun(input: KbSourceRunInput): Promise<KbSourceRun>;
  delete(id: string): Promise<boolean>;
  /** Deletes all run rows for this source (scoped repo). */
  deleteRunsForSource(sourceId: string): Promise<void>;
  /** Hard-deletes a single source item row (children cascade via FK). */
  deleteSourceItem(id: string): Promise<boolean>;
  findSourceItemByInboxItemId(
    inboxItemId: string
  ): Promise<KbSourceItem | null>;
  findSourceItemBySourceUrl(
    kbId: string,
    sourceUrl: string
  ): Promise<KbSourceItem | null>;
  getById(id: string): Promise<KbSource | null>;
  getByWebhookTokenHash(tokenHash: string): Promise<KbSource | null>;
  getRunById(id: string): Promise<KbSourceRun | null>;
  getRunningRun(sourceId: string): Promise<KbSourceRun | null>;
  getSourceItemById(id: string): Promise<KbSourceItem | null>;
  getSourceItemByKey(
    sourceId: string,
    adapterItemKey: string
  ): Promise<KbSourceItem | null>;
  listDue(nowIso: string, limit?: number): Promise<KbSource[]>;
  listItemsPaginated(
    sourceId: string,
    params: KbSourceItemListQueryParams
  ): Promise<PaginatedResponse<KbSourceItem>>;
  listPaginated(
    params: KbSourceListQueryParams
  ): Promise<PaginatedResponse<KbSource>>;
  listRecentRuns(sourceId: string, limit?: number): Promise<KbSourceRun[]>;
  listSourceItemLinks(sourceItemId: string): Promise<KbSourceItemLink[]>;
  listSourceItemMedia(sourceItemId: string): Promise<KbSourceItemMedia[]>;
  listSourceItemSections(sourceItemId: string): Promise<KbSourceItemSection[]>;
  replaceSourceItemLinks(
    sourceItemId: string,
    links: KbSourceItemLinkInput[]
  ): Promise<KbSourceItemLink[]>;
  replaceSourceItemMedia(
    sourceItemId: string,
    media: KbSourceItemMediaInput[]
  ): Promise<KbSourceItemMedia[]>;
  replaceSourceItemSections(
    sourceItemId: string,
    sections: KbSourceItemSectionInput[]
  ): Promise<KbSourceItemSection[]>;
  update(id: string, input: KbSourceUpdateInput): Promise<KbSource | null>;
  updateRun(
    id: string,
    input: KbSourceRunUpdateInput
  ): Promise<KbSourceRun | null>;
  updateSourceItem(
    id: string,
    input: KbSourceItemUpdateInput
  ): Promise<KbSourceItem | null>;
  upsertSourceItem(input: KbSourceItemInput): Promise<KbSourceItem>;
}

/* ── Settings Repo ── */

export interface KbSettingsRepo {
  get(): Promise<KbSettings>;
  /** Merge icon/cover into the per-KB `kb.display` KV row (no full settings read beyond this key). */
  patchKbDisplay(kbId: string, patch: Partial<KbDisplay>): Promise<KbDisplay>;
  /** Replace hub start page block layout (`kb.page_layout` scoped KV row). */
  patchKbPageLayout(
    kbId: string,
    layout: KbPageLayoutSettings
  ): Promise<KbPageLayoutSettings>;
  set(input: KbSettingsInput): Promise<KbSettings>;
}

/* ── Combined factory ── */

export interface KbRepoFactory {
  activity_log: KbActivityLogRepo;
  article_comments: ArticleCommentRepo;
  articles: ArticleRepo;
  attachments: AttachmentRepo;
  categories: CategoryRepo;
  faqs: FaqRepo;
  inbox: InboxRepo;
  kb: KbRepo;
  settings: KbSettingsRepo;
  source_references: SourceReferenceRepo;
  sources: KbSourceRepo;
  tags: TagRepo;
  templates: KbTemplateRepo;
  versions: KbVersionRepo;
}
