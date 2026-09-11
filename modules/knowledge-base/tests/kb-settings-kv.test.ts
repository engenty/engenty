import { describe, expect, it } from "vitest";
import {
  KB_KV_KEY,
  KB_KV_SCOPE_CONTEXT,
  kbKvContextForKbId,
  kbSettingsFromKvRows,
} from "../src/dal/kb-settings-kv.js";

describe("kbSettingsFromKvRows", () => {
  it("assembles defaults when no rows", () => {
    const s = kbSettingsFromKvRows([]);
    expect(s.embedding_model).toContain("embedding");
    expect(s.kb_chunking_by_id).toEqual({});
    expect(s.kb_display_by_id).toEqual({});
    expect(s.sidebar_article_tree_defaults_by_kb).toEqual({});
  });

  it("reads scope scalars and per-kb json rows", () => {
    const rows = [
      {
        context: KB_KV_SCOPE_CONTEXT,
        name: KB_KV_KEY.embeddingModel,
        type: "string",
        value: "openai/custom",
      },
      {
        context: KB_KV_SCOPE_CONTEXT,
        name: KB_KV_KEY.searchVectorMinSimilarity,
        type: "numeric",
        value: 0.5,
      },
      {
        context: KB_KV_SCOPE_CONTEXT,
        name: KB_KV_KEY.searchVerifierMinQueryTerms,
        type: "numeric",
        value: 3,
      },
      {
        context: KB_KV_SCOPE_CONTEXT,
        name: KB_KV_KEY.searchVerifierMaxCandidates,
        type: "numeric",
        value: 8,
      },
      {
        context: kbKvContextForKbId("kb-a"),
        name: KB_KV_KEY.display,
        type: "json",
        value: { icon: "📚", cover: null },
      },
      {
        context: kbKvContextForKbId("kb-a"),
        name: KB_KV_KEY.chunking,
        type: "json",
        value: { max_length: 2000, overlap: 50, strategy: "markdown" },
      },
      {
        context: kbKvContextForKbId("kb-b"),
        name: KB_KV_KEY.chunking,
        type: "json",
        value: { strategy: "bogus" },
      },
      {
        context: kbKvContextForKbId("kb-a"),
        name: KB_KV_KEY.sidebarArticleTreeDefaults,
        type: "json",
        value: { default_expand_depth: 2 },
      },
    ];
    const s = kbSettingsFromKvRows(rows);
    expect(s.embedding_model).toBe("openai/custom");
    expect(s.kb_chunking_by_id["kb-a"]).toEqual({
      max_length: 2000,
      overlap: 50,
      strategy: "markdown",
    });
    // An invalid row is ignored: the library falls back to the defaults.
    expect(s.kb_chunking_by_id["kb-b"]).toBeUndefined();
    expect(s.search_vector_min_similarity).toBe(0.5);
    expect(s.search_verifier_min_query_terms).toBe(3);
    expect(s.search_verifier_max_candidates).toBe(8);
    expect(s.kb_display_by_id["kb-a"]?.icon).toBe("📚");
    expect(s.sidebar_article_tree_defaults_by_kb["kb-a"]).toBeDefined();
  });
});
