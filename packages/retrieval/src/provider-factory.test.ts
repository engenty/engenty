// The manufactured provider must be indistinguishable from a hand-rolled one
// for the registry/host: correct filter scoping, tenant guards, delegation.

import { describe, expect, it } from "vitest";
import { createRetrievalService } from "./service.js";
import {
  createFakeEmbedder,
  createFakeSupabase,
  makeSource,
} from "./test-utils.js";

function setup(source = makeSource()) {
  const supabase = createFakeSupabase();
  const { calls, embedder } = createFakeEmbedder();
  const service = createRetrievalService({
    createEmbedder: () => embedder,
    resolveEmbeddingModel: () => Promise.resolve(embedder.modelId),
    supabase: supabase as never,
  });
  service.registerSource(source);
  const provider = service.getProvider(source.source_type);
  if (!provider) {
    throw new Error("provider not manufactured");
  }
  return { embedCalls: calls, provider, service, supabase };
}

describe("createManagedProvider", () => {
  it("search scopes to its own source_type and forwards auth filters", async () => {
    const { provider, supabase } = setup(
      makeSource({
        retriever: {
          mapFilters: (filters) => ({
            metadata:
              typeof filters.kb_id === "string"
                ? { kb_id: filters.kb_id }
                : undefined,
          }),
        },
      })
    );
    await provider.search({
      filters: {
        kb_id: "kb-9",
        tenant_id: "tenant-1",
        user_id: "user-1",
      } as never,
      limit: 5,
      query: "hello there world",
    });
    const args = supabase.rpc.calls[0]?.args;
    expect(args?.p_source_types).toEqual(["demo.item"]);
    expect(args?.p_tenant_id).toBe("tenant-1");
    expect(args?.p_user_id).toBe("user-1");
    expect(args?.p_metadata).toEqual({ kb_id: "kb-9" });
  });

  it("re-registration replaces (plugin reload); unknown sources throw on use", async () => {
    const { service } = setup();
    const replacement = makeSource({ visibility: "space" });
    service.registerSource(replacement);
    expect(service.listSources()).toHaveLength(1);
    expect(service.listSources()[0]?.visibility).toBe("space");
    await expect(
      service.backfill("nope.nope", { tenant_id: "tenant-1" })
    ).rejects.toThrow(/Unknown retrieval source/);
  });

  it("replaceDocument ingests; deleteDocument removes", async () => {
    const { embedCalls, provider, supabase } = setup();
    await provider.replaceDocument({
      document: {
        doc_id: "doc-7",
        source_id: "doc-7",
        source_type: "demo.item",
        source_updated_at: "2026-07-05T00:00:00Z",
        tenant_id: "tenant-1",
        text: "content",
      } as never,
    });
    expect(embedCalls).toEqual([["content"]]);
    expect(
      supabase.tableFor("chunks").calls.some((call) => call.method === "upsert")
    ).toBe(true);

    await provider.deleteDocument({ doc_id: "doc-7", tenant_id: "tenant-1" });
    expect(
      supabase
        .tableFor("documents")
        .calls.some((call) => call.method === "delete")
    ).toBe(true);
  });

  it("getStatus without tenant returns the empty shape", async () => {
    const { provider } = setup();
    expect(await provider.getStatus?.({})).toMatchObject({
      missing_count: 0,
      total_count: 0,
    });
  });

  it("every source embeds with the model the host resolves, per call", async () => {
    const supabase = createFakeSupabase();
    const seen: string[] = [];
    let bound = "role/model-a";
    const service = createRetrievalService({
      createEmbedder: (modelId) => {
        seen.push(modelId);
        return createFakeEmbedder(modelId).embedder;
      },
      resolveEmbeddingModel: () => Promise.resolve(bound),
      supabase: supabase as never,
    });
    service.registerSource(makeSource());
    service.registerSource(makeSource({ source_type: "demo.other" }));
    await service.ingest({
      doc_id: "doc-1",
      source_type: "demo.item",
      tenant_id: "tenant-1",
    });
    await service.ingest({
      doc_id: "doc-2",
      source_type: "demo.other",
      tenant_id: "tenant-1",
    });
    // One embedder per model, shared across sources.
    expect(seen).toEqual(["role/model-a"]);

    bound = "role/model-b";
    expect(await service.embeddingModel()).toBe("role/model-b");
    await service.search({
      filters: { tenant_id: "tenant-1" },
      limit: 5,
      query: "hello there world",
    });
    expect(seen).toEqual(["role/model-a", "role/model-b"]);
    expect(supabase.rpc.calls[0]?.args.p_embedding_model).toBe("role/model-b");
  });

  it("an empty model from the host fails loudly", async () => {
    const service = createRetrievalService({
      resolveEmbeddingModel: () => Promise.resolve("  "),
      supabase: createFakeSupabase() as never,
    });
    service.registerSource(makeSource());
    await expect(
      service.ingest({
        doc_id: "doc-1",
        source_type: "demo.item",
        tenant_id: "tenant-1",
      })
    ).rejects.toThrow(/embedding role/);
  });

  it("status counts docs embedded by another model as stale", async () => {
    const supabase = createFakeSupabase({
      tables: {
        documents: [
          {
            content_updated_at: "2026-07-05T00:00:00Z",
            doc_id: "doc-1",
            embedding_model: "old/model",
            indexed_at: "2026-07-05T00:00:00Z",
          },
        ],
      },
    });
    const { embedder } = createFakeEmbedder("new/model");
    const service = createRetrievalService({
      createEmbedder: () => embedder,
      resolveEmbeddingModel: () => Promise.resolve("new/model"),
      supabase: supabase as never,
    });
    service.registerSource(
      makeSource({
        listDocuments: () =>
          Promise.resolve([
            { doc_id: "doc-1", updated_at: "2026-07-05T00:00:00Z" },
          ]),
      })
    );
    const status = await service.status("demo.item", {
      tenant_id: "tenant-1",
    });
    expect(status).toMatchObject({ current_count: 0, stale_count: 1 });
  });
});
