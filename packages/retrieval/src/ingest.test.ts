import { describe, expect, it } from "vitest";
import { ingestById, ingestDocument } from "./ingest.js";
import { createRetrievalStore } from "./store.js";
import {
  createFakeEmbedder,
  createFakeSupabase,
  makeDocument,
  makeSource,
} from "./test-utils.js";

function makeDeps(supabase: ReturnType<typeof createFakeSupabase>) {
  const { calls, embedder } = createFakeEmbedder();
  return {
    deps: {
      resolveEmbedder: () => Promise.resolve(embedder),
      source: makeSource(),
      store: createRetrievalStore(supabase as never),
    },
    embedCalls: calls,
  };
}

describe("ingest", () => {
  it("upserts document + chunks and trims the stale tail", async () => {
    const supabase = createFakeSupabase();
    const { deps, embedCalls } = makeDeps(supabase);
    await ingestDocument(deps, makeDocument({ text: "hello" }));

    expect(embedCalls).toEqual([["hello"]]);
    const documents = supabase.tableFor("documents");
    expect(
      documents.calls.filter((call) => call.method === "upsert")
    ).toHaveLength(1);
    const chunks = supabase.tableFor("chunks");
    // Tail trim (delete + gte chunk_index >= count) precedes the upsert.
    expect(chunks.calls.map((call) => call.method)).toEqual(
      expect.arrayContaining(["delete", "gte", "upsert"])
    );
    const gte = chunks.calls.find((call) => call.method === "gte");
    expect(gte?.args).toEqual(["chunk_index", 1]);
    const upsert = chunks.calls.find((call) => call.method === "upsert");
    const rows = upsert?.args[0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({
      doc_id: "doc-1",
      embedding: [5, 1, 0],
      embedding_model: "fake/embed-3",
      tenant_id: "tenant-1",
    });
  });

  it("ingestById deletes the index entry when buildDocument returns null", async () => {
    const supabase = createFakeSupabase();
    const { deps, embedCalls } = makeDeps(supabase);
    deps.source = makeSource({
      buildDocument: () => Promise.resolve(null),
    });
    await ingestById(deps, { doc_id: "gone", tenant_id: "tenant-1" });

    expect(embedCalls).toEqual([]);
    const documents = supabase.tableFor("documents");
    expect(documents.calls[0]?.method).toBe("delete");
  });

  it("empty document text deletes instead of embedding", async () => {
    const supabase = createFakeSupabase();
    const { deps, embedCalls } = makeDeps(supabase);
    await ingestDocument(deps, makeDocument({ text: "   " }));
    expect(embedCalls).toEqual([]);
    expect(supabase.tableFor("documents").calls[0]?.method).toBe("delete");
  });
});
