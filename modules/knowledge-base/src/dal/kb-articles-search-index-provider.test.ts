// Lean coverage for `KbArticlesSearchIndexProvider`. Three outcomes matter:
//
//   1. **Explicit lexical (BM25)** must skip the embedder entirely — the hub
//      typing-suggest hot path must not pay for vectors just because the
//      provider also advertises `hybrid` / `semantic` capabilities.
//
//   2. **Multi-KB fan-out** — search with `kb_id` omitted must call
//      `repos.kb.list()` and run a per-KB query, then merge by score
//      (preserving the AGENTS rule "omit kb_id → search every accessible
//      KB").
//
//   3. **Tenant isolation** — search returns nothing without a tenant_id;
//      `replaceDocument` and `deleteDocument` reject empty tenants without
//      writing to Supabase. The synthesized SDK auto-tool already overrides
//      tenant_id from `ctx.auth`; the provider is the last line of defense
//      when called directly (admin route, backfill).
//
// We do not snapshot RPC payloads or hydration logic — those are owned by
// `module_kb.search_kb_embeddings` and the article mapper. We're testing
// the provider's _decisions_, not Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { ArticleRepo, KbRepo, KbSettingsRepo } from "./contracts.js";
import { createKbArticlesSearchIndexProvider } from "./kb-articles-search-index-provider.js";
import { DEFAULT_KB_SETTINGS } from "./shared.js";

// Partial mock — keep the rest of the `ai` module (jsonSchema, ToolLoopAgent,
// etc.) intact so packages/ai-core tools that pull it in still load. Only the
// embed entrypoints are stubbed.
vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    embed: vi.fn(async () => ({ embedding: new Array(1536).fill(0.1) })),
    embedMany: vi.fn(async (input: { values: string[] }) => ({
      embeddings: input.values.map(() => new Array(1536).fill(0.1)),
    })),
  } as unknown as typeof actual;
});

interface FakeSupabase {
  // Test-only handles for the article and embeddings table builders so we can
  // assert "no DB writes happened during a refused request".
  __embeddingsBuilder: {
    delete: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
  rpc: ReturnType<typeof vi.fn>;
  schema: ReturnType<typeof vi.fn>;
}

function makeFakeSupabase(): FakeSupabase {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  const articlesBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const embeddingsBuilder = {
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    select: vi.fn().mockReturnThis(),
  };
  // First call -> articles (used by getDocumentById/backfill)
  // Second call -> embeddings (used by replace/delete)
  // The provider goes through `embeddingsTable()` and `articlesTable()` which
  // both call schema(...).from(name); we pick by name for clarity.
  const schemaBuilder = {
    from: vi.fn((name: string) =>
      name === "article_embeddings" ? embeddingsBuilder : articlesBuilder
    ),
    rpc,
  };
  return {
    __embeddingsBuilder: embeddingsBuilder as never,
    rpc,
    schema: vi.fn(() => schemaBuilder),
  };
}

function makeFakeRepos(opts?: {
  kbs?: { id: string; name: string }[];
  ftsHits?: { id: string; title: string; kb_id: string; rank: number }[];
}) {
  const kbs = opts?.kbs ?? [{ id: "kb-1", name: "Knowledge Base 1" }];
  const ftsHits = opts?.ftsHits ?? [];
  const articles: ArticleRepo = {
    create: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn().mockResolvedValue(null),
    getDetailWithNeighbors: vi.fn(),
    list: vi.fn(),
    listArticleIdsPaginated: vi.fn(),
    listInlineLinksForGraph: vi.fn(),
    listPaginated: vi.fn(),
    setTags: vi.fn(),
    suggestFts: vi.fn().mockImplementation(async (kbId: string) =>
      ftsHits
        .filter((h) => h.kb_id === kbId)
        .map((h) => ({
          headline: h.title,
          id: h.id,
          kb_id: h.kb_id,
          rank: h.rank,
          title: h.title,
        }))
    ),
    update: vi.fn(),
  } as unknown as ArticleRepo;

  const kbRepo: KbRepo = {
    create: vi.fn(),
    delete: vi.fn(),
    getById: vi
      .fn()
      .mockImplementation(
        async (id: string) => kbs.find((kb) => kb.id === id) ?? null
      ),
    list: vi.fn().mockResolvedValue(kbs),
    update: vi.fn(),
  } as unknown as KbRepo;

  const settings: KbSettingsRepo = {
    get: vi.fn().mockResolvedValue(DEFAULT_KB_SETTINGS),
    patchKbDisplay: vi.fn(),
    update: vi.fn(),
  } as unknown as KbSettingsRepo;

  return { articles, kb: kbRepo, settings };
}

describe("KbArticlesSearchIndexProvider — explicit lexical bypass", () => {
  it("skips the embedder when strategy='lexical' is explicit", async () => {
    const supabase = makeFakeSupabase();
    const aiModule = (await import("ai")) as unknown as {
      embed: ReturnType<typeof vi.fn>;
      embedMany: ReturnType<typeof vi.fn>;
    };
    aiModule.embed.mockClear();
    aiModule.embedMany.mockClear();

    const repos = makeFakeRepos({
      ftsHits: [{ id: "a-1", kb_id: "kb-1", rank: 1, title: "Hit 1" }],
    });
    const provider = createKbArticlesSearchIndexProvider({
      resolveRepos: () => repos,
      supabase: supabase as unknown as SupabaseClient,
    });

    const result = await provider.search({
      filters: { kb_id: "kb-1", tenant_id: "tenant-1" },
      limit: 10,
      query: "anwalt",
      strategy: "lexical",
    });

    expect(aiModule.embed).not.toHaveBeenCalled();
    expect(aiModule.embedMany).not.toHaveBeenCalled();
    // Vector RPC must not run on the explicit lexical path.
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      "search_kb_embeddings",
      expect.anything()
    );
    expect(result.results.map((r) => r.item.article_id)).toEqual(["a-1"]);
  });
});

describe("KbArticlesSearchIndexProvider — multi-KB fan-out", () => {
  it("calls repos.kb.list and runs per-KB queries when kb_id is omitted", async () => {
    const supabase = makeFakeSupabase();
    const repos = makeFakeRepos({
      kbs: [
        { id: "kb-a", name: "KB A" },
        { id: "kb-b", name: "KB B" },
      ],
      ftsHits: [
        { id: "a-1", kb_id: "kb-a", rank: 2, title: "Hit A" },
        { id: "b-1", kb_id: "kb-b", rank: 3, title: "Hit B" },
      ],
    });
    const listSpy = vi.spyOn(repos.kb, "list");
    const suggestSpy = vi.spyOn(repos.articles, "suggestFts");

    const provider = createKbArticlesSearchIndexProvider({
      resolveRepos: () => repos,
      supabase: supabase as unknown as SupabaseClient,
    });

    const result = await provider.search({
      filters: { tenant_id: "tenant-1" },
      limit: 10,
      query: "topic",
      strategy: "lexical",
    });

    expect(listSpy).toHaveBeenCalledTimes(1);
    // suggestFts ran once per KB.
    expect(suggestSpy).toHaveBeenCalledTimes(2);
    const ids = new Set(result.results.map((r) => r.item.article_id));
    expect(ids.has("a-1")).toBe(true);
    expect(ids.has("b-1")).toBe(true);
    // Each hit is stamped with its source kb_id so multi-KB callers can
    // render the source KB.
    for (const r of result.results) {
      expect(r.item.kb_id).toMatch(/^kb-(a|b)$/);
    }
  });
});

describe("KbArticlesSearchIndexProvider — tenant isolation", () => {
  it("returns empty without tenant_id (defense in depth)", async () => {
    const supabase = makeFakeSupabase();
    const repos = makeFakeRepos();
    const provider = createKbArticlesSearchIndexProvider({
      resolveRepos: () => repos,
      supabase: supabase as unknown as SupabaseClient,
    });

    const result = await provider.search({
      filters: {},
      limit: 10,
      query: "anything",
    });

    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
    // No KB list lookup, no RPC.
    expect(repos.kb.list).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("refuses replaceDocument without tenant_id", async () => {
    const supabase = makeFakeSupabase();
    const repos = makeFakeRepos();
    const provider = createKbArticlesSearchIndexProvider({
      resolveRepos: () => repos,
      supabase: supabase as unknown as SupabaseClient,
    });

    await provider.replaceDocument({
      document: {
        doc_id: "article-1",
        source_id: "article-1",
        source_type: "kb.article",
        tenant_id: "",
        text: "anything",
      },
    });

    // No `embeddings` writes occurred — provider returned early.
    expect(supabase.__embeddingsBuilder.delete).not.toHaveBeenCalled();
    expect(supabase.__embeddingsBuilder.insert).not.toHaveBeenCalled();
  });

  it("refuses deleteDocument without tenant_id", async () => {
    const supabase = makeFakeSupabase();
    const repos = makeFakeRepos();
    const provider = createKbArticlesSearchIndexProvider({
      resolveRepos: () => repos,
      supabase: supabase as unknown as SupabaseClient,
    });

    await provider.deleteDocument({ doc_id: "article-1", tenant_id: "" });

    expect(supabase.__embeddingsBuilder.delete).not.toHaveBeenCalled();
  });
});
