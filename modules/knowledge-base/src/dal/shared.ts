import {
  normalizeKbCategoryPageSettings,
  normalizeKbCoverInheritance,
} from "../schema/categories.js";
import type {
  KbCommentsModeBinding,
  KbEffectiveCommentsMode,
} from "../schema/comments.js";
import {
  articlePropertyDefinitionsSchema,
  kbCoverSchema,
} from "../schema/knowledge-bases.js";
import { KB_HUB_PAGE_LAYOUT_DEFAULTS } from "../schema/page-blocks.js";
import { kbTemplatePropertyDefinitionsSchema } from "../schema/templates.js";
import type {
  Article,
  Attachment,
  Faq,
  KbArticleTemplate,
  KbCategory,
  KbCategoryViewType,
  KbCover,
  KbDisplay,
  KbPageLayoutSettings,
  KbSettings,
  KnowledgeBase,
  Tag,
} from "../schema/types.js";

export const SCHEMA = "module_kb";

function parseCommentsModeBinding(raw: unknown): KbCommentsModeBinding {
  if (
    raw === "inherit" ||
    raw === "none" ||
    raw === "enabled" ||
    raw === "closed"
  ) {
    return raw;
  }
  return "inherit";
}

function parseRootCommentsMode(raw: unknown): KbEffectiveCommentsMode {
  if (raw === "none" || raw === "enabled" || raw === "closed") {
    return raw;
  }
  return "enabled";
}

export const DEFAULT_KB_SETTINGS: KbSettings = {
  default_kb_id: null,
  embedding_model: "openai/text-embedding-3-small",
  auto_generate_summary: true,
  auto_generate_questions: true,
  search_vector_min_similarity: 0.45,
  search_verifier_min_query_terms: 3,
  search_verifier_max_candidates: 6,
  kb_display_by_id: {},
  kb_page_layout_by_id: {},
  sidebar_article_tree_defaults_by_kb: {},
};

function parseArticlePropertyDefinitions(
  raw: unknown
): KnowledgeBase["article_property_definitions"] {
  const parsed = articlePropertyDefinitionsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function parseCustomProperties(
  raw: unknown
): Record<string, string | number | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null) {
      out[k] = null;
    } else if (typeof v === "string" || typeof v === "number") {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeTemplatePropertyDefinitionsRaw(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw;
  }
  return raw.map((item) => {
    if (!(item && typeof item === "object") || Array.isArray(item)) {
      return item;
    }
    const record = item as Record<string, unknown>;
    if (record.type === "select") {
      return item;
    }
    const { options: _options, ...rest } = record;
    return rest;
  });
}

function parseTemplatePropertyDefinitions(
  raw: unknown
): KbArticleTemplate["property_definitions"] {
  const parsed = kbTemplatePropertyDefinitionsSchema.safeParse(
    sanitizeTemplatePropertyDefinitionsRaw(raw)
  );
  return parsed.success ? parsed.data : [];
}

export function rowToKb(row: Record<string, unknown>): KnowledgeBase {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description ? String(row.description) : null,
    is_default: Boolean(row.is_default),
    /* Display fields (icon, cover) are not DB columns — populated at API layer. */
    icon: null,
    cover: null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    article_property_definitions: parseArticlePropertyDefinitions(
      row.article_property_definitions
    ),
    comments_mode: parseRootCommentsMode(row.comments_mode),
    page_layout: { ...KB_HUB_PAGE_LAYOUT_DEFAULTS },
  };
}

/** Merge per-KB hub page layout from kb_settings into a KB object. */
export function enrichKbPageLayout(
  kb: KnowledgeBase,
  layout: KbPageLayoutSettings | undefined
): KnowledgeBase {
  if (!layout) {
    return kb;
  }
  return { ...kb, page_layout: layout };
}

/** Merge display + page layout KV rows onto a KB record. */
export function enrichKbFromSettings(
  kb: KnowledgeBase,
  display: KbDisplay | undefined,
  pageLayout: KbPageLayoutSettings | undefined
): KnowledgeBase {
  return enrichKbPageLayout(enrichKbDisplay(kb, display), pageLayout);
}

export function rowToTemplate(row: Record<string, unknown>): KbArticleTemplate {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: String(row.kb_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    property_definitions: parseTemplatePropertyDefinitions(
      row.property_definitions
    ),
    content_json: parseTiptapJson(row.content_json),
    content_markdown: row.content_markdown
      ? String(row.content_markdown)
      : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  };
}

/** Merge per-KB display settings from kb_settings into a KB object. */
export function enrichKbDisplay(
  kb: KnowledgeBase,
  display: KbDisplay | undefined
): KnowledgeBase {
  if (!display) {
    return kb;
  }
  return { ...kb, icon: display.icon ?? null, cover: display.cover ?? null };
}

function parseTiptapJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function parseKbCover(raw: unknown): KbCover | null {
  if (!raw) {
    return null;
  }
  const parsed = kbCoverSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseViewType(raw: unknown): KbCategoryViewType {
  return raw === "folder" ? "folder" : "collection";
}

export function rowToCategory(row: Record<string, unknown>): KbCategory {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: String(row.kb_id),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    name: String(row.name),
    slug: String(row.slug),
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    sort_order: Number(row.sort_order ?? 0),
    comments_mode: parseCommentsModeBinding(row.comments_mode),
    template_mode:
      row.template_mode === "none" || row.template_mode === "template"
        ? row.template_mode
        : "inherit",
    template_id: row.template_id ? String(row.template_id) : null,
    is_default: Boolean(row.is_default),
    cover: parseKbCover(row.cover),
    cover_inheritance: normalizeKbCoverInheritance(row.cover_inheritance),
    intro_json: parseTiptapJson(row.intro_json),
    intro_markdown: row.intro_markdown ? String(row.intro_markdown) : null,
    outro_json: parseTiptapJson(row.outro_json),
    outro_markdown: row.outro_markdown ? String(row.outro_markdown) : null,
    view_type: parseViewType(row.view_type),
    page_settings: normalizeKbCategoryPageSettings(row.page_settings, {
      intro_json: parseTiptapJson(row.intro_json),
      intro_markdown: row.intro_markdown ? String(row.intro_markdown) : null,
      outro_json: parseTiptapJson(row.outro_json),
      outro_markdown: row.outro_markdown ? String(row.outro_markdown) : null,
    }),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function rowToTag(row: Record<string, unknown>): Tag {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: String(row.kb_id),
    name: String(row.name),
    slug: String(row.slug),
    color: row.color ? String(row.color) : null,
    created_at: String(row.created_at),
  };
}

export function rowToArticle(
  row: Record<string, unknown>,
  tags?: Tag[]
): Article {
  const qa = row.questions_answered;
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: String(row.kb_id),
    category_id: String(row.category_id),
    parent_article_id: row.parent_article_id
      ? String(row.parent_article_id)
      : null,
    title: String(row.title),
    slug: String(row.slug),
    status: String(row.status) as Article["status"],
    content_json: (row.content_json as Record<string, unknown>) ?? null,
    content_markdown: row.content_markdown
      ? String(row.content_markdown)
      : null,
    summary: row.summary ? String(row.summary) : null,
    questions_answered: Array.isArray(qa) ? qa.map(String) : [],
    original_document_url: row.original_document_url
      ? String(row.original_document_url)
      : null,
    original_document_name: row.original_document_name
      ? String(row.original_document_name)
      : null,
    created_by: row.created_by ? String(row.created_by) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    published_at: row.published_at ? String(row.published_at) : null,
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    locked_at: row.locked_at ? String(row.locked_at) : null,
    comments_mode: parseCommentsModeBinding(row.comments_mode),
    custom_properties: parseCustomProperties(row.custom_properties),
    template_mode:
      row.template_mode === "none" || row.template_mode === "template"
        ? row.template_mode
        : "inherit",
    template_id: row.template_id ? String(row.template_id) : null,
    tags,
  };
}

export function rowToAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    article_id: String(row.article_id),
    filename: String(row.filename),
    storage_key: String(row.storage_key),
    mime_type: String(row.mime_type),
    size_bytes: Number(row.size_bytes ?? 0),
    created_at: String(row.created_at),
  };
}

export function rowToFaq(row: Record<string, unknown>, tags?: Tag[]): Faq {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: String(row.kb_id),
    question: String(row.question),
    answer_json: (row.answer_json as Record<string, unknown>) ?? null,
    answer_markdown: row.answer_markdown ? String(row.answer_markdown) : null,
    sort_order: Number(row.sort_order ?? 0),
    status: String(row.status) as Faq["status"],
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    tags,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
export async function getTagsForIds(
  supabase: SupabaseClient,
  tenantId: string,
  tableName: "article_tags" | "faq_tags",
  idCol: "article_id" | "faq_id",
  ids: string[]
): Promise<Map<string, Tag[]>> {
  const map = new Map<string, Tag[]>();
  for (const id of ids) {
    map.set(id, []);
  }
  if (ids.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(tableName as any)
    .select(`${idCol}, tags(*)`)
    .in(idCol, ids);

  if (!error && data) {
    for (const row of data as any[]) {
      const id = String(row[idCol]);
      if (row.tags) {
        map.get(id)?.push(rowToTag(row.tags));
      }
    }
  }
  return map;
}
