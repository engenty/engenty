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
    const replacement = makeSource({ visibility: "owner" });
    service.registerSource(replacement);
    expect(service.listSources()).toHaveLength(1);
    expect(service.listSources()[0]?.visibility).toBe("owner");
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
      supabase
        .tableFor("chunks")
        .calls.some((call) => call.method === "upsert")
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

  it("per-tenant model resolution wins over static model and default", async () => {
    const supabase = createFakeSupabase();
    const seen: string[] = [];
    const service = createRetrievalService({
      createEmbedder: (modelId) => {
        seen.push(modelId);
        return createFakeEmbedder(modelId).embedder;
      },
      supabase: supabase as never,
    });
    service.registerSource(
      makeSource({
        embedding: {
          model: "static/model",
          resolveModel: () => Promise.resolve("tenant/model"),
        },
      })
    );
    await service.ingest({
      doc_id: "doc-1",
      source_type: "demo.item",
      tenant_id: "tenant-1",
    });
    expect(seen).toEqual(["tenant/model"]);
  });
});
