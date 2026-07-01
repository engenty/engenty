import {
  KB_SIDEBAR_ARTICLE_TREE_DEFAULTS,
  type KbSidebarArticleTreePrefs,
  mergeKbSidebarArticleTreeUserPrefs,
} from "../schema/kb-sidebar-article-tree.js";
import type { KbSettings } from "../schema/types.js";
import { kbSettingsSchema } from "../schema/zod.js";
import type { GetKbRepo, KbServerApi } from "./kb-api-shared.js";

export function registerKbSettingsRoutes(api: KbServerApi, getRepo: GetKbRepo) {
  /* ── Settings ── */

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/settings",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const settings = await repos.settings.get();
      return settings;
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/kb/settings",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const current = await repos.settings.get();
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      const mergedByKb: KbSettings["sidebar_article_tree_defaults_by_kb"] = {
        ...current.sidebar_article_tree_defaults_by_kb,
      };
      if (
        raw.sidebar_article_tree_defaults_by_kb !== undefined &&
        raw.sidebar_article_tree_defaults_by_kb !== null &&
        typeof raw.sidebar_article_tree_defaults_by_kb === "object" &&
        !Array.isArray(raw.sidebar_article_tree_defaults_by_kb)
      ) {
        for (const [kbId, v] of Object.entries(
          raw.sidebar_article_tree_defaults_by_kb as Record<string, unknown>
        )) {
          const prev = mergedByKb[kbId] ?? KB_SIDEBAR_ARTICLE_TREE_DEFAULTS;
          mergedByKb[kbId] = mergeKbSidebarArticleTreeUserPrefs(
            v && typeof v === "object" && !Array.isArray(v)
              ? (v as Partial<KbSidebarArticleTreePrefs>)
              : null,
            prev
          );
        }
      }

      const payload: KbSettings = {
        default_kb_id:
          raw.default_kb_id === undefined
            ? current.default_kb_id
            : (raw.default_kb_id as string | null),
        embedding_model:
          typeof raw.embedding_model === "string"
            ? raw.embedding_model
            : current.embedding_model,
        auto_generate_summary:
          typeof raw.auto_generate_summary === "boolean"
            ? raw.auto_generate_summary
            : current.auto_generate_summary,
        auto_generate_questions:
          typeof raw.auto_generate_questions === "boolean"
            ? raw.auto_generate_questions
            : current.auto_generate_questions,
        search_vector_min_similarity:
          typeof raw.search_vector_min_similarity === "number"
            ? raw.search_vector_min_similarity
            : current.search_vector_min_similarity,
        search_verifier_min_query_terms:
          typeof raw.search_verifier_min_query_terms === "number"
            ? raw.search_verifier_min_query_terms
            : current.search_verifier_min_query_terms,
        search_verifier_max_candidates:
          typeof raw.search_verifier_max_candidates === "number"
            ? raw.search_verifier_max_candidates
            : current.search_verifier_max_candidates,
        chunk_strategy:
          typeof raw.chunk_strategy === "string"
            ? (raw.chunk_strategy as KbSettings["chunk_strategy"])
            : current.chunk_strategy,
        chunk_max_length:
          typeof raw.chunk_max_length === "number"
            ? raw.chunk_max_length
            : current.chunk_max_length,
        chunk_overlap:
          typeof raw.chunk_overlap === "number"
            ? raw.chunk_overlap
            : current.chunk_overlap,
        sidebar_article_tree_defaults_by_kb:
          raw.sidebar_article_tree_defaults_by_kb === undefined
            ? current.sidebar_article_tree_defaults_by_kb
            : mergedByKb,
        /* Preserve kb_display_by_id — managed via the KB update endpoint. */
        kb_display_by_id: current.kb_display_by_id,
        kb_page_layout_by_id: current.kb_page_layout_by_id,
      };

      const parsed = kbSettingsSchema.parse(payload);
      const settings = await repos.settings.set({
        ...parsed,
        default_kb_id: parsed.default_kb_id ?? null,
        kb_display_by_id: payload.kb_display_by_id,
        kb_page_layout_by_id: payload.kb_page_layout_by_id,
      } as KbSettings);
      return settings;
    },
  });
}
