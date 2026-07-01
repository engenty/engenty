import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { EngentyKbVectorStore } from "./kb-vector-store.js";

interface FakeSupabase {
  __embeddingsBuilder: {
    delete: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
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
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    select: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ count: 42, error: null }),
    })),
  };
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

const mockRepos = {
  articles: {
    suggestFts: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
  },
  kb: {
    getById: vi.fn().mockResolvedValue(null),
  },
  settings: {
    get: vi.fn().mockResolvedValue({
      search_vector_min_similarity: 0.7,
      search_verifier_max_candidates: 3,
    }),
  },
};

describe("EngentyKbVectorStore", () => {
  it("queries the database using search_kb_embeddings RPC", async () => {
    const supabase = makeFakeSupabase();
    const store = new EngentyKbVectorStore({
      id: "test-store",
      supabase: supabase as unknown as SupabaseClient,
      resolveRepos: () => mockRepos,
    });

    supabase.rpc.mockResolvedValue({
      data: [
        {
          article_id: "art-1",
          similarity: 0.85,
          chunk_text: "chunk text 1",
          title: "Title 1",
        },
      ],
      error: null,
    });

    const results = await store.query({
      indexName: "kb-1",
      queryVector: [0.1, 0.2],
      topK: 5,
      filter: {
        tenant_id: "tenant-1",
        scope_id: "default",
        match_threshold: 0.8,
      },
    });

    expect(supabase.rpc).toHaveBeenCalledWith("search_kb_embeddings", {
      p_tenant_id: "tenant-1",
      p_scope_id: "default",
      p_kb_id: "kb-1",
      p_embedding: "[0.1,0.2]",
      p_match_count: 5,
      p_match_threshold: 0.8,
      p_max_cosine_distance: null,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: "art-1",
      score: 0.85,
      metadata: expect.objectContaining({
        title: "Title 1",
        text: "chunk text 1",
        kb_id: "kb-1",
      }),
    });
  });

  it("upserts chunks by first deleting existing embeddings and then inserting rows", async () => {
    const supabase = makeFakeSupabase();
    const store = new EngentyKbVectorStore({
      id: "test-store",
      supabase: supabase as unknown as SupabaseClient,
      resolveRepos: () => mockRepos,
    });

    const mockVectors = [[0.1, 0.2]];
    const mockMetadata = [
      {
        tenant_id: "tenant-1",
        article_id: "art-1",
        chunk_index: 0,
        text: "hello world",
      },
    ];

    const ids = await store.upsert({
      indexName: "article_embeddings",
      vectors: mockVectors,
      metadata: mockMetadata,
    });

    expect(supabase.schema).toHaveBeenCalledWith("module_kb");
    expect(supabase.__embeddingsBuilder.delete).toHaveBeenCalled();
    expect(supabase.__embeddingsBuilder.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenant_id: "tenant-1",
          article_id: "art-1",
          chunk_index: 0,
          chunk_text: "hello world",
          embedding: [0.1, 0.2],
        }),
      ])
    );
    expect(ids).toHaveLength(1);
  });

  it("deletes vectors matching a filter", async () => {
    const supabase = makeFakeSupabase();
    const store = new EngentyKbVectorStore({
      id: "test-store",
      supabase: supabase as unknown as SupabaseClient,
      resolveRepos: () => mockRepos,
    });

    await store.deleteVectors({
      indexName: "article_embeddings",
      filter: {
        tenant_id: "tenant-1",
        article_id: "art-1",
      },
    });

    expect(supabase.schema).toHaveBeenCalledWith("module_kb");
    expect(supabase.__embeddingsBuilder.delete).toHaveBeenCalled();
    expect(supabase.__embeddingsBuilder.eq).toHaveBeenCalledWith(
      "tenant_id",
      "tenant-1"
    );
    expect(supabase.__embeddingsBuilder.eq).toHaveBeenCalledWith(
      "article_id",
      "art-1"
    );
  });
});
