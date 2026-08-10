import { beforeEach, describe, expect, it, vi } from "vitest";

const kbApiMocks = vi.hoisted(() => ({
  suggestKbArticles: vi.fn(),
  searchKb: vi.fn(),
}));

vi.mock("./api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api.js")>();
  return {
    ...actual,
    suggestKbArticles: kbApiMocks.suggestKbArticles,
    searchKb: kbApiMocks.searchKb,
  };
});

import type { KbSearchResult } from "../src/schema/types.js";
import type { KbArticleSuggestHit } from "./api.js";
import {
  mergeKbHybridSuggestHits,
  suggestKbArticlesHybrid,
} from "./kb-suggest-hybrid.js";

describe("mergeKbHybridSuggestHits", () => {
  it("prefers FTS order and fills remaining slots from vector", () => {
    const fts: KbArticleSuggestHit[] = [
      { id: "a", kb_id: "kb-1", rank: 2, title: "A", headline: "ha" },
      { id: "b", kb_id: "kb-1", rank: 1, title: "B", headline: "hb" },
    ];
    const vec: KbSearchResult[] = [
      {
        article_id: "b",
        title: "B",
        chunk_text: "dup",
        score: 0.9,
      },
      {
        article_id: "c",
        title: "C",
        chunk_text: "semantic hit",
        score: 0.8,
      },
    ];
    const merged = mergeKbHybridSuggestHits("kb-1", fts, vec, 4);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("respects limit", () => {
    const fts: KbArticleSuggestHit[] = [
      { id: "1", kb_id: "kb-1", rank: 2, title: "T1", headline: "" },
      { id: "2", kb_id: "kb-1", rank: 1, title: "T2", headline: "" },
    ];
    const vec: KbSearchResult[] = [
      {
        article_id: "3",
        title: "T3",
        chunk_text: "x",
        score: 1,
      },
    ];
    expect(mergeKbHybridSuggestHits("kb-1", fts, vec, 2)).toHaveLength(2);
    expect(
      mergeKbHybridSuggestHits("kb-1", fts, vec, 2).map((m) => m.id)
    ).toEqual(["1", "2"]);
  });
});

describe("suggestKbArticlesHybrid", () => {
  beforeEach(() => {
    kbApiMocks.suggestKbArticles.mockReset();
    kbApiMocks.searchKb.mockReset();
  });

  it("skips vector when FTS already fills the limit", async () => {
    const fts: KbArticleSuggestHit[] = Array.from({ length: 8 }, (_, i) => ({
      id: `a${i}`,
      kb_id: "kb-1",
      rank: 8 - i,
      title: "T",
      headline: "",
    }));
    kbApiMocks.suggestKbArticles.mockResolvedValue(fts);
    kbApiMocks.searchKb.mockResolvedValue({ results: [] });
    await suggestKbArticlesHybrid("kb-1", "long enough query", { limit: 8 });
    expect(kbApiMocks.searchKb).not.toHaveBeenCalled();
  });

  it("skips vector for short queries even when FTS is sparse", async () => {
    kbApiMocks.suggestKbArticles.mockResolvedValue([
      { id: "a", kb_id: "kb-1", rank: 1, title: "A", headline: "" },
    ]);
    kbApiMocks.searchKb.mockResolvedValue({ results: [] });
    const hits = await suggestKbArticlesHybrid("kb-1", "ab", { limit: 8 });
    expect(kbApiMocks.searchKb).not.toHaveBeenCalled();
    expect(hits).toHaveLength(1);
  });

  it("calls vector when query is long, FTS sparse, and limit not met", async () => {
    kbApiMocks.suggestKbArticles.mockResolvedValue([
      { id: "a", kb_id: "kb-1", rank: 1, title: "A", headline: "" },
    ]);
    const vecHit: KbSearchResult = {
      article_id: "b",
      title: "B",
      chunk_text: "semantic",
      score: 0.9,
    };
    kbApiMocks.searchKb.mockResolvedValue({ results: [vecHit] });
    const hits = await suggestKbArticlesHybrid("kb-1", "semantic topic here", {
      limit: 8,
    });
    expect(kbApiMocks.searchKb).toHaveBeenCalled();
    expect(hits.map((h) => h.id)).toEqual(["a", "b"]);
  });
});
