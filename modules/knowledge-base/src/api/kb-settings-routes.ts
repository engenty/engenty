import {
  KB_SIDEBAR_ARTICLE_TREE_DEFAULTS,
  type KbSidebarArticleTreePrefs,
  mergeKbSidebarArticleTreeUserPrefs,
} from "../schema/kb-sidebar-article-tree.js";
import type { KbSettings } from "../schema/types.js";
import { kbSettingsSchema } from "../schema/zod.js";
import type { GetKbRepo, KbServerApi } from "./kb-api-shared.js";

/**
 * Module settings: the tenant-wide index infrastructure (embedding model,
 * retrieval-quality knobs). Per-library values (`*_by_id` maps) are read here
 * for transport but written through the KB record endpoint — except the
 * sidebar defaults, whose per-KB form still saves through this PUT and is
 * merged key-by-key so a stale page cannot clobber another library's row.
 */
export function registerKbSettingsRoutes(api: KbServerApi, getRepo: GetKbRepo) {
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
        sidebar_article_tree_defaults_by_kb: mergedByKb,
        // Per-library rows are owned by `PUT /api/kb/knowledge-bases/:id`.
        kb_chunking_by_id: current.kb_chunking_by_id,
        kb_display_by_id: current.kb_display_by_id,
        kb_page_layout_by_id: current.kb_page_layout_by_id,
      };

      const parsed = kbSettingsSchema.parse(payload);
      return repos.settings.set({
        ...parsed,
        kb_chunking_by_id: payload.kb_chunking_by_id,
        kb_display_by_id: payload.kb_display_by_id,
        kb_page_layout_by_id: payload.kb_page_layout_by_id,
      } as KbSettings);
    },
  });
}
