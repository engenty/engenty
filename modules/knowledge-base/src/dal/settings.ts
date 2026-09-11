import { createScopedKvSettingsRepoSupabase } from "@engenty/scoped-kv-settings";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kbChunkingSchema } from "../schema/chunking.js";
import {
  kbPageLayoutSettingsSchema,
  normalizeKbPageLayoutSettings,
} from "../schema/page-blocks.js";
import { kbDisplaySchema } from "../schema/settings.js";
import type {
  KbChunking,
  KbDisplay,
  KbPageLayoutSettings,
  KbSettings,
  KbSettingsInput,
} from "../schema/types.js";
import type { KbSettingsRepo } from "./contracts.js";
import {
  KB_KV_KEY,
  KB_KV_SCOPE_CONTEXT,
  kbKvContextForKbId,
  kbSettingsFromKvRows,
} from "./kb-settings-kv.js";
import { SCHEMA } from "./shared.js";

function collectPerKbIdsForKey(
  rows: Awaited<
    ReturnType<ReturnType<typeof createScopedKvSettingsRepoSupabase>["list"]>
  >,
  keyName: string
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.name !== keyName) {
      continue;
    }
    const kbId = row.context.kb_id;
    if (typeof kbId === "string" && kbId.length > 0) {
      ids.add(kbId);
    }
  }
  return ids;
}

export function createKbSettingsRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): KbSettingsRepo {
  const kv = createScopedKvSettingsRepoSupabase({
    adapter: supabase,
    schema: SCHEMA,
    table: "kb_settings",
    tenantId,
    scopeId,
  });

  const settings: KbSettingsRepo = {
    async get(): Promise<KbSettings> {
      const rows = await kv.list();
      const mapped = rows.map((r) => ({
        context: r.context,
        name: r.name,
        type: r.type,
        value: r.value,
      }));
      return kbSettingsFromKvRows(mapped);
    },

    async set(input: KbSettingsInput): Promise<KbSettings> {
      const existing = await kv.list();

      const oldDisplayIds = collectPerKbIdsForKey(existing, KB_KV_KEY.display);
      const oldChunkingIds = collectPerKbIdsForKey(
        existing,
        KB_KV_KEY.chunking
      );
      const oldSidebarIds = collectPerKbIdsForKey(
        existing,
        KB_KV_KEY.sidebarArticleTreeDefaults
      );

      await kv.set(KB_KV_SCOPE_CONTEXT, {
        name: KB_KV_KEY.embeddingModel,
        type: "string",
        value_string: input.embedding_model,
      });
      await kv.set(KB_KV_SCOPE_CONTEXT, {
        name: KB_KV_KEY.searchVectorMinSimilarity,
        type: "numeric",
        value_numeric: input.search_vector_min_similarity,
      });
      await kv.set(KB_KV_SCOPE_CONTEXT, {
        name: KB_KV_KEY.searchVerifierMinQueryTerms,
        type: "numeric",
        value_numeric: input.search_verifier_min_query_terms,
      });
      await kv.set(KB_KV_SCOPE_CONTEXT, {
        name: KB_KV_KEY.searchVerifierMaxCandidates,
        type: "numeric",
        value_numeric: input.search_verifier_max_candidates,
      });

      const nextDisplayIds = new Set(Object.keys(input.kb_display_by_id));
      for (const id of oldDisplayIds) {
        if (!nextDisplayIds.has(id)) {
          await kv.delete(kbKvContextForKbId(id), KB_KV_KEY.display);
        }
      }
      for (const [kbId, display] of Object.entries(input.kb_display_by_id)) {
        await kv.set(kbKvContextForKbId(kbId), {
          name: KB_KV_KEY.display,
          type: "json",
          value_jsonb: display,
        });
      }

      const nextChunkingIds = new Set(Object.keys(input.kb_chunking_by_id));
      for (const id of oldChunkingIds) {
        if (!nextChunkingIds.has(id)) {
          await kv.delete(kbKvContextForKbId(id), KB_KV_KEY.chunking);
        }
      }
      for (const [kbId, chunking] of Object.entries(input.kb_chunking_by_id)) {
        await kv.set(kbKvContextForKbId(kbId), {
          name: KB_KV_KEY.chunking,
          type: "json",
          value_jsonb: chunking,
        });
      }

      const nextSidebarIds = new Set(
        Object.keys(input.sidebar_article_tree_defaults_by_kb)
      );
      for (const id of oldSidebarIds) {
        if (!nextSidebarIds.has(id)) {
          await kv.delete(
            kbKvContextForKbId(id),
            KB_KV_KEY.sidebarArticleTreeDefaults
          );
        }
      }
      for (const [kbId, prefs] of Object.entries(
        input.sidebar_article_tree_defaults_by_kb
      )) {
        await kv.set(kbKvContextForKbId(kbId), {
          name: KB_KV_KEY.sidebarArticleTreeDefaults,
          type: "json",
          value_jsonb: prefs,
        });
      }

      return settings.get();
    },

    async patchKbDisplay(
      kbId: string,
      patch: Partial<KbDisplay>
    ): Promise<KbDisplay> {
      const ctx = kbKvContextForKbId(kbId);
      const cur = await kv.get(ctx, KB_KV_KEY.display);
      const rawPrev =
        cur?.value && typeof cur.value === "object" && !Array.isArray(cur.value)
          ? (cur.value as Record<string, unknown>)
          : {};
      const prevParsed = kbDisplaySchema.safeParse(rawPrev);
      const prev = prevParsed.success ? prevParsed.data : {};
      const merged = { ...prev, ...patch };
      const next = kbDisplaySchema.parse(merged);
      await kv.set(ctx, {
        name: KB_KV_KEY.display,
        type: "json",
        value_jsonb: next,
      });
      return next;
    },

    async patchKbChunking(
      kbId: string,
      chunking: KbChunking | null
    ): Promise<KbChunking | null> {
      const ctx = kbKvContextForKbId(kbId);
      if (chunking === null) {
        await kv.delete(ctx, KB_KV_KEY.chunking);
        return null;
      }
      const next = kbChunkingSchema.parse(chunking);
      await kv.set(ctx, {
        name: KB_KV_KEY.chunking,
        type: "json",
        value_jsonb: next,
      });
      return next;
    },

    async patchKbPageLayout(
      kbId: string,
      layout: KbPageLayoutSettings
    ): Promise<KbPageLayoutSettings> {
      const ctx = kbKvContextForKbId(kbId);
      const next = kbPageLayoutSettingsSchema.parse(
        normalizeKbPageLayoutSettings(layout, undefined, {
          append_missing_faqs: true,
        })
      );
      await kv.set(ctx, {
        name: KB_KV_KEY.pageLayout,
        type: "json",
        value_jsonb: next,
      });
      return next;
    },
  };
  return settings;
}
