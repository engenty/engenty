import type { ScopedKvContext } from "@engenty/scoped-kv-settings";
import { kbChunkingSchema } from "../schema/chunking.js";
import {
  type KbSidebarArticleTreePrefs,
  mergeKbSidebarArticleTreePrefs,
} from "../schema/kb-sidebar-article-tree.js";
import { normalizeKbPageLayoutSettings } from "../schema/page-blocks.js";
import { kbDisplaySchema } from "../schema/settings.js";
import type { KbChunking, KbDisplay, KbSettings } from "../schema/types.js";
import { DEFAULT_KB_SETTINGS } from "./shared.js";

/** Scope-wide KV context (no extra dimensions). */
export const KB_KV_SCOPE_CONTEXT: ScopedKvContext = {};

export function kbKvContextForKbId(kbId: string): ScopedKvContext {
  return { kb_id: kbId };
}

export const KB_KV_KEY = {
  embeddingModel: "kb.embedding_model",
  searchVectorMinSimilarity: "kb.search_vector_min_similarity",
  searchVerifierMinQueryTerms: "kb.search_verifier_min_query_terms",
  searchVerifierMaxCandidates: "kb.search_verifier_max_candidates",
  chunking: "kb.chunking",
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

function parseKbChunkingByIdFromRows(
  rows: KbKvRow[]
): KbSettings["kb_chunking_by_id"] {
  const out: KbSettings["kb_chunking_by_id"] = {};
  for (const row of rows) {
    if (row.name !== KB_KV_KEY.chunking) {
      continue;
    }
    const kbId = kbIdFromContext(row.context);
    if (!kbId) {
      continue;
    }
    const parsed = kbChunkingSchema.safeParse(row.value);
    if (parsed.success) {
      out[kbId] = parsed.data as KbChunking;
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

/** Assemble aggregate KB settings from scoped KV rows (for tests + repo). */
export function kbSettingsFromKvRows(rows: KbKvRow[]): KbSettings {
  return {
    embedding_model: getScopeString(
      rows,
      KB_KV_KEY.embeddingModel,
      DEFAULT_KB_SETTINGS.embedding_model
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
    kb_chunking_by_id: parseKbChunkingByIdFromRows(rows),
    kb_display_by_id: parseKbDisplayByIdFromRows(rows),
    kb_page_layout_by_id: parsePageLayoutByIdFromRows(rows),
    sidebar_article_tree_defaults_by_kb: parseSidebarDefaultsFromRows(rows),
  };
}
