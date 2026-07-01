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
    expect(s.default_kb_id).toBeNull();
    expect(s.embedding_model).toContain("embedding");
    expect(s.kb_display_by_id).toEqual({});
    expect(s.sidebar_article_tree_defaults_by_kb).toEqual({});
  });

  it("reads scope scalars and per-kb json rows", () => {
    const rows = [
      {
        context: KB_KV_SCOPE_CONTEXT,
        name: KB_KV_KEY.defaultKbId,
        type: "string",
        value: "kb-1",
      },
      {
        context: KB_KV_SCOPE_CONTEXT,
        name: KB_KV_KEY.embeddingModel,
        type: "string",
        value: "openai/custom",
      },
      {
        context: KB_KV_SCOPE_CONTEXT,
        name: KB_KV_KEY.autoGenerateSummary,
        type: "boolean",
        value: false,
      },
      {
        context: KB_KV_SCOPE_CONTEXT,
        name: KB_KV_KEY.autoGenerateQuestions,
        type: "boolean",
        value: true,
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
        name: KB_KV_KEY.sidebarArticleTreeDefaults,
        type: "json",
        value: { default_expand_depth: 2 },
      },
    ];
    const s = kbSettingsFromKvRows(rows);
    expect(s.default_kb_id).toBe("kb-1");
    expect(s.embedding_model).toBe("openai/custom");
    expect(s.auto_generate_summary).toBe(false);
    expect(s.auto_generate_questions).toBe(true);
    expect(s.search_vector_min_similarity).toBe(0.5);
    expect(s.search_verifier_min_query_terms).toBe(3);
    expect(s.search_verifier_max_candidates).toBe(8);
    expect(s.kb_display_by_id["kb-a"]?.icon).toBe("📚");
    expect(s.sidebar_article_tree_defaults_by_kb["kb-a"]).toBeDefined();
  });
});
