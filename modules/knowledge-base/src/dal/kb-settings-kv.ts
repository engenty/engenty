import type { ScopedKvContext } from "@engenty/scoped-kv-settings";
import {
  type KbSidebarArticleTreePrefs,
  mergeKbSidebarArticleTreePrefs,
} from "../schema/kb-sidebar-article-tree.js";
import { normalizeKbPageLayoutSettings } from "../schema/page-blocks.js";
import { kbDisplaySchema } from "../schema/settings.js";
import type { KbDisplay, KbSettings } from "../schema/types.js";
import { DEFAULT_KB_SETTINGS } from "./shared.js";

/** Scope-wide KV context (no extra dimensions). */
export const KB_KV_SCOPE_CONTEXT: ScopedKvContext = {};

export function kbKvContextForKbId(kbId: string): ScopedKvContext {
  return { kb_id: kbId };
}

export const KB_KV_KEY = {
  defaultKbId: "kb.default_kb_id",
  embeddingModel: "kb.embedding_model",
  autoGenerateSummary: "kb.auto_generate_summary",
  autoGenerateQuestions: "kb.auto_generate_questions",
  searchVectorMinSimilarity: "kb.search_vector_min_similarity",
  searchVerifierMinQueryTerms: "kb.search_verifier_min_query_terms",
  searchVerifierMaxCandidates: "kb.search_verifier_max_candidates",
  display: "kb.display",
  pageLayout: "kb.page_layout",
  sidebarArticleTreeDefaults: "kb.sidebar_article_tree.defaults",
} as const;

export interface KbKvRow {
  context: ScopedKvContext;
  name: string;
  type: string;
  value: unknown;
}

function kbIdFromContext(ctx: ScopedKvContext): string | null {
  if (typeof ctx.kb_id === "string" && ctx.kb_id.length > 0) {
    return ctx.kb_id;
  }
  return null;
}

function isScopeContext(ctx: ScopedKvContext): boolean {
  return Object.keys(ctx).length === 0;
}

function parsePageLayoutByIdFromRows(
  rows: KbKvRow[]
): KbSettings["kb_page_layout_by_id"] {
  const out: KbSettings["kb_page_layout_by_id"] = {};
  for (const row of rows) {
    if (row.name !== KB_KV_KEY.pageLayout) {
      continue;
    }
    const kbId = kbIdFromContext(row.context);
    if (!kbId) {
      continue;
    }
    out[kbId] = normalizeKbPageLayoutSettings(row.value, undefined, {
      append_missing_faqs: true,
    });
  }
  return out;
}

function parseKbDisplayByIdFromRows(
  rows: KbKvRow[]
): KbSettings["kb_display_by_id"] {
  const out: KbSettings["kb_display_by_id"] = {};
  for (const row of rows) {
    if (row.name !== KB_KV_KEY.display) {
      continue;
    }
    const kbId = kbIdFromContext(row.context);
    if (!kbId) {
      continue;
    }
    const parsed = kbDisplaySchema.safeParse(row.value);
    if (parsed.success) {
      out[kbId] = parsed.data as KbDisplay;
    }
  }
  return out;
}

function parseSidebarDefaultsFromRows(
  rows: KbKvRow[]
): KbSettings["sidebar_article_tree_defaults_by_kb"] {
  const out: KbSettings["sidebar_article_tree_defaults_by_kb"] = {};
  for (const row of rows) {
    if (row.name !== KB_KV_KEY.sidebarArticleTreeDefaults) {
      continue;
    }
    const kbId = kbIdFromContext(row.context);
    if (!kbId) {
      continue;
    }
    out[kbId] = mergeKbSidebarArticleTreePrefs(
      row.value && typeof row.value === "object" && !Array.isArray(row.value)
        ? (row.value as Partial<KbSidebarArticleTreePrefs>)
        : null
    );
  }
  return out;
}

function getScopeString(
  rows: KbKvRow[],
  name: string,
  fallback: string
): string {
  const row = rows.find((r) => isScopeContext(r.context) && r.name === name);
  if (!row || row.value === null || row.value === undefined) {
    return fallback;
  }
  return String(row.value);
}

function getScopeBoolean(
  rows: KbKvRow[],
  name: string,
  fallback: boolean
): boolean {
  const row = rows.find((r) => isScopeContext(r.context) && r.name === name);
  if (!row || typeof row.value !== "boolean") {
    return fallback;
  }
  return row.value;
}

function getScopeNumber(
  rows: KbKvRow[],
  name: string,
  fallback: number
): number {
  const row = rows.find((r) => isScopeContext(r.context) && r.name === name);
  if (
    !row ||
    (typeof row.value !== "number" && typeof row.value !== "string")
  ) {
    return fallback;
  }
  const n = Number(row.value);
  return Number.isFinite(n) ? n : fallback;
}

function getScopeNullableString(rows: KbKvRow[], name: string): string | null {
  const row = rows.find((r) => isScopeContext(r.context) && r.name === name);
  if (!row || row.value === null || row.value === undefined) {
    return null;
  }
  const s = String(row.value).trim();
  return s.length > 0 ? s : null;
}

/** Assemble aggregate KB settings from scoped KV rows (for tests + repo). */
export function kbSettingsFromKvRows(rows: KbKvRow[]): KbSettings {
  return {
    // No KV keys exist for chunking yet — defaults are the effective values.
    chunk_strategy: DEFAULT_KB_SETTINGS.chunk_strategy,
    chunk_max_length: DEFAULT_KB_SETTINGS.chunk_max_length,
    chunk_overlap: DEFAULT_KB_SETTINGS.chunk_overlap,
    default_kb_id: getScopeNullableString(rows, KB_KV_KEY.defaultKbId),
    embedding_model: getScopeString(
      rows,
      KB_KV_KEY.embeddingModel,
      DEFAULT_KB_SETTINGS.embedding_model
    ),
    auto_generate_summary: getScopeBoolean(
      rows,
      KB_KV_KEY.autoGenerateSummary,
      DEFAULT_KB_SETTINGS.auto_generate_summary
    ),
    auto_generate_questions: getScopeBoolean(
      rows,
      KB_KV_KEY.autoGenerateQuestions,
      DEFAULT_KB_SETTINGS.auto_generate_questions
    ),
    search_vector_min_similarity: getScopeNumber(
      rows,
      KB_KV_KEY.searchVectorMinSimilarity,
      DEFAULT_KB_SETTINGS.search_vector_min_similarity
    ),
    search_verifier_min_query_terms: getScopeNumber(
      rows,
      KB_KV_KEY.searchVerifierMinQueryTerms,
      DEFAULT_KB_SETTINGS.search_verifier_min_query_terms
    ),
    search_verifier_max_candidates: getScopeNumber(
      rows,
      KB_KV_KEY.searchVerifierMaxCandidates,
      DEFAULT_KB_SETTINGS.search_verifier_max_candidates
    ),
    kb_display_by_id: parseKbDisplayByIdFromRows(rows),
    kb_page_layout_by_id: parsePageLayoutByIdFromRows(rows),
    sidebar_article_tree_defaults_by_kb: parseSidebarDefaultsFromRows(rows),
  };
}
