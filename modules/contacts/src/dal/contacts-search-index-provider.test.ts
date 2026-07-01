// Lean coverage for `ContactsSearchIndexProvider`. Two outcomes matter:
//
//   1. **Explicit lexical (BM25)** must skip the embedder entirely — quick
//      search must not pay for vectors just because the provider also
//      advertises `hybrid` / `semantic` capabilities.
//
//   2. **Tenant isolation** — search returns nothing without a tenant_id;
//      `replaceDocument` and `deleteDocument` reject empty tenants without
//      writing to Supabase. The synthesized SDK auto-tool already overrides
//      tenant_id from `ctx.auth`; the provider is the last line of defense
//      when called directly (admin route, backfill).
//
// We do not snapshot RPC payloads or hydration logic — those are owned by
// `module_contacts.search_contacts` and the contact mapper, which have their
// own coverage. We're testing the provider's _decisions_, not Supabase.

import { describe, expect, it, vi } from "vitest";
import { createContactsSearchIndexProvider } from "./contacts-search-index-provider.js";

// Module-level mocks for the AI SDK so the embedder never tries to issue a
// real embed call. The `lexical` test below asserts these are NOT called.
vi.mock("ai", () => ({
  embed: vi.fn(async () => ({ embedding: [0.1, 0.2, 0.3] })),
  embedMany: vi.fn(async (input: { values: string[] }) => ({
    embeddings: input.values.map(() => [0.1, 0.2, 0.3]),
  })),
}));

interface FakeSupabase {
  rpc: ReturnType<typeof vi.fn>;
  schema: ReturnType<typeof vi.fn>;
}

function makeFakeSupabase(): FakeSupabase {
  // `rpc` returns an empty payload — we only care which arguments the
  // provider sent (specifically the embedding fields).
  const rpc = vi.fn().mockResolvedValue({
    data: { matches: [], total: 0 },
    error: null,
  });
  const tableBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const schemaBuilder = {
    from: vi.fn(() => tableBuilder),
    rpc,
  };
  return {
    rpc,
    schema: vi.fn(() => schemaBuilder),
  };
}

describe("ContactsSearchIndexProvider — explicit lexical bypass", () => {
  it("skips the embedder when strategy='lexical' is explicit", async () => {
    const supabase = makeFakeSupabase();
    const aiModule = (await import("ai")) as unknown as {
      embed: ReturnType<typeof vi.fn>;
      embedMany: ReturnType<typeof vi.fn>;
    };
    aiModule.embed.mockClear();
    aiModule.embedMany.mockClear();

    const provider = createContactsSearchIndexProvider({
      supabase: supabase as never,
    });

    await provider.search({
      filters: { tenant_id: "tenant-1" },
      limit: 10,
      query: "Anwalt",
      strategy: "lexical",
    });

    expect(aiModule.embed).not.toHaveBeenCalled();
    expect(aiModule.embedMany).not.toHaveBeenCalled();
    // RPC still ran but with null embedding fields — BM25/FTS/trigram only.
    expect(supabase.rpc).toHaveBeenCalledWith(
      "search_contacts",
      expect.objectContaining({
        p_query: "Anwalt",
        p_query_embedding: null,
        p_query_embeddings: null,
      })
    );
  });

  it("calls the embedder for hybrid/default strategy with a non-empty query", async () => {
    const supabase = makeFakeSupabase();
    const aiModule = (await import("ai")) as unknown as {
      embed: ReturnType<typeof vi.fn>;
      embedMany: ReturnType<typeof vi.fn>;
    };
    aiModule.embed.mockClear();
    aiModule.embedMany.mockClear();

    const provider = createContactsSearchIndexProvider({
      supabase: supabase as never,
    });

    await provider.search({
      filters: { tenant_id: "tenant-1" },
      limit: 10,
      query: "Anwalt",
      strategy: "hybrid",
    });

    // Either single or batch embed is acceptable; the contract is "embedder
    // ran for hybrid" — not which call shape the SDK chose.
    const embedCalls =
      aiModule.embed.mock.calls.length + aiModule.embedMany.mock.calls.length;
    expect(embedCalls).toBeGreaterThan(0);
  });
});

describe("ContactsSearchIndexProvider — tenant isolation", () => {
  it("returns empty without a tenant_id filter (defense in depth)", async () => {
    const supabase = makeFakeSupabase();
    const provider = createContactsSearchIndexProvider({
      supabase: supabase as never,
    });

    const result = await provider.search({
      filters: {},
      limit: 10,
      query: "anything",
    });

    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
    // No RPC issued at all — we refuse to call Supabase without a tenant.
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("refuses replaceDocument without tenant_id", async () => {
    const supabase = makeFakeSupabase();
    const provider = createContactsSearchIndexProvider({
      supabase: supabase as never,
    });

    await provider.replaceDocument({
      document: {
        doc_id: "contact-1",
        source_id: "contact-1",
        source_type: "contacts.contact",
        tenant_id: "",
        text: "anything",
      },
    });

    // No upsert call routed through schema().from() — embeddings table never touched.
    expect(supabase.schema).not.toHaveBeenCalled();
  });
});
