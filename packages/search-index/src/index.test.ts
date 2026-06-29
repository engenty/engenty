import { describe, expect, it, vi } from "vitest";
import {
  compactSearchText,
  createMinimumSignalVerifier,
  createSearchChunkId,
  createSearchChunks,
  createSearchIndexRegistry,
  createWeightedScoreReranker,
  defineEmbedder,
  embedTexts,
  normalizeSearchLimit,
  parseSearchChunkId,
  parseSearchPayload,
  resolveSearchStrategy,
  type SearchCandidate,
  type SearchIndexProvider,
  serializeSearchVector,
} from "./index.js";

describe("search index chunk ids", () => {
  it("creates and parses deterministic chunk ids", () => {
    const chunkId = createSearchChunkId("chat-thread:123", 2);

    expect(chunkId).toBe("chat-thread:123::chunk::2");
    expect(parseSearchChunkId(chunkId)).toEqual({
      chunk_index: 2,
      doc_id: "chat-thread:123",
    });
  });

  it("rejects invalid chunk indexes", () => {
    expect(() => createSearchChunkId("doc-1", -1)).toThrow(
      "chunkIndex must be a non-negative integer"
    );
    expect(parseSearchChunkId("doc-1::chunk::-1")).toBeNull();
  });
});

describe("search index reusable helpers", () => {
  it("compacts text and creates fixed-mode chunks with offsets", () => {
    expect(compactSearchText([" title ", null, "body"])).toBe("title\n\nbody");
    const chunks = createSearchChunks({
      doc_id: "doc-1",
      max_chunk_length: 4,
      text: "abcd efgh",
    });
    expect(chunks).toEqual([
      {
        chunk_id: "doc-1::chunk::0",
        chunk_index: 0,
        doc_id: "doc-1",
        source_offset: { end: 4, start: 0 },
        text: "abcd",
      },
      {
        chunk_id: "doc-1::chunk::1",
        chunk_index: 1,
        doc_id: "doc-1",
        source_offset: { end: 8, start: 4 },
        text: "efg",
      },
      {
        chunk_id: "doc-1::chunk::2",
        chunk_index: 2,
        doc_id: "doc-1",
        source_offset: { end: 9, start: 8 },
        text: "h",
      },
    ]);
  });

  it("populates source_lines when track_lines is enabled", () => {
    const text = "line1\nline2\n\nline4";
    const chunks = createSearchChunks({
      doc_id: "doc-2",
      max_chunk_length: 100,
      text,
      track_lines: true,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].source_lines).toEqual({ end: 4, start: 1 });
  });

  it("chunks paragraphs with overlap and offsets", () => {
    const text = ["Para A first.", "Para B second.", "Para C third."].join(
      "\n\n"
    );
    const chunks = createSearchChunks({
      doc_id: "doc-3",
      max_chunk_length: 20,
      mode: "paragraph",
      overlap: 6,
      text,
      track_lines: true,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].source_offset?.start).toBe(0);
    expect(chunks[0].source_offset?.end).toBe("Para A first.".length);
    expect(chunks[1].text).toContain("Para B second.");
    expect(chunks[1].source_lines?.start).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) {
      expect(chunk.source_offset).toBeDefined();
    }
  });

  it("normalizes payload, limit, and vectors", () => {
    expect(parseSearchPayload('{"total":1,"matches":[{"id":"a"}]}')).toEqual({
      matches: [{ id: "a" }],
      total: 1,
    });
    expect(normalizeSearchLimit(500, { max_limit: 100 })).toBe(100);
    expect(serializeSearchVector([1, 2])).toBe("[1,2]");
  });

  it("reranks and verifies generic candidates", async () => {
    const low: SearchCandidate = {
      doc_id: "low",
      item: {},
      matched_fields: [],
      score: 1,
      source_scores: { fts: 0 },
    };
    const high: SearchCandidate = {
      doc_id: "high",
      item: {},
      matched_fields: [],
      score: 1,
      source_scores: { fts: 1, recency: 1 },
    };
    const verifier = createMinimumSignalVerifier();
    const reranker = createWeightedScoreReranker({
      source_weights: { recency: 0.05 },
    });

    const verified = await Promise.resolve(
      verifier.verify({
        candidates: [low, high],
        query: "invoice",
        strategy: "hybrid",
      })
    );
    const reranked = await Promise.resolve(
      reranker.rerank({
        candidates: verified,
        query: "invoice",
        strategy: "hybrid",
      })
    );

    expect(verified).toEqual([high]);
    expect(reranked).toEqual([high]);
  });
});

describe("SearchEmbedder", () => {
  it("calls the embedder once when texts fit in one batch", async () => {
    const fn = vi.fn().mockResolvedValue([
      [1, 2, 3],
      [4, 5, 6],
    ] as number[][]);
    const embedder = defineEmbedder(fn, {
      batch: true,
      dimensions: 3,
      maxBatchSize: 8,
      modelId: "openai/text-embedding-3-small",
    });
    const result = await embedTexts(embedder, ["a", "b"]);
    expect(result).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(embedder.batch).toBe(true);
    expect(embedder.maxBatchSize).toBe(8);
    expect(embedder.dimensions).toBe(3);
  });

  it("splits into parallel batches when texts exceed maxBatchSize", async () => {
    const fn = vi
      .fn()
      .mockImplementation(async (texts: string[]) => texts.map(() => [1, 2]));
    const embedder = defineEmbedder(fn, {
      batch: true,
      dimensions: 2,
      maxBatchSize: 2,
      modelId: "openai/text-embedding-3-small",
    });
    const result = await embedTexts(embedder, ["a", "b", "c", "d", "e"]);
    expect(result).toHaveLength(5);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid embedder metadata at definition time", () => {
    expect(() =>
      defineEmbedder(() => Promise.resolve([]), {
        dimensions: 0,
        modelId: "x",
      })
    ).toThrow();
    expect(() =>
      defineEmbedder(() => Promise.resolve([]), {
        dimensions: 1536,
        modelId: "  ",
      })
    ).toThrow();
  });
});

describe("SearchIndexRegistry", () => {
  const stubProvider: SearchIndexProvider = {
    id: "test_search",
    capabilities: { lexical: true, semantic: true, hybrid: true },
    deleteDocument: async () => {},
    replaceDocument: async () => {},
    search: async () => ({ results: [], total: 0 }),
    version: "1",
  };

  it("registers, lists, looks up, and unregisters providers", () => {
    const registry = createSearchIndexRegistry();
    expect(registry.has("test_search")).toBe(false);
    registry.register(stubProvider);
    expect(registry.has("test_search")).toBe(true);
    expect(registry.get("test_search")).toBe(stubProvider);
    expect(registry.list()).toEqual([stubProvider]);
    expect(registry.unregister("test_search")).toBe(true);
    expect(registry.has("test_search")).toBe(false);
  });

  it("rejects duplicate ids and missing ids", () => {
    const registry = createSearchIndexRegistry();
    registry.register(stubProvider);
    expect(() => registry.register(stubProvider)).toThrow();
    expect(() =>
      registry.register({ ...stubProvider, id: "" } as SearchIndexProvider)
    ).toThrow();
  });

  it("captures registration metadata for the admin surface", () => {
    const registry = createSearchIndexRegistry();
    const registration = registry.register(stubProvider, {
      entityName: "thing",
      isSystem: false,
      moduleId: "test",
      operationId: "test_thing_search",
    });
    expect(registration.metadata).toMatchObject({
      capabilities: { lexical: true, semantic: true, hybrid: true },
      entityName: "thing",
      isSystem: false,
      moduleId: "test",
      operationId: "test_thing_search",
      version: "1",
    });
    expect(registration.metadata.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(registry.getRegistration("test_search")).toBe(registration);
    expect(registry.listRegistrations()).toEqual([registration]);
  });

  it("falls back to provider hints when metadata is omitted", () => {
    const registry = createSearchIndexRegistry();
    const registration = registry.register(stubProvider);
    expect(registration.metadata).toMatchObject({
      capabilities: { lexical: true, semantic: true, hybrid: true },
      entityName: "test_search",
      isSystem: false,
      moduleId: "test_search",
      operationId: undefined,
      version: "1",
    });
  });
});

describe("resolveSearchStrategy", () => {
  it("returns the explicit strategy when present", () => {
    expect(
      resolveSearchStrategy(
        { lexical: true, semantic: true, hybrid: true },
        { strategy: "lexical" }
      )
    ).toBe("lexical");
  });

  it("prefers hybrid when all three are supported", () => {
    expect(
      resolveSearchStrategy({ lexical: true, semantic: true, hybrid: true })
    ).toBe("hybrid");
  });

  it("falls back to semantic, then lexical", () => {
    expect(resolveSearchStrategy({ semantic: true })).toBe("semantic");
    expect(resolveSearchStrategy({})).toBe("lexical");
  });
});
