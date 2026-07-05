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

// Backfill must "scan wide, work narrow": the contact scan runs over the full
// MAX_STATUS_SCAN window and only the *target* list is cut to `limit`.
// Filtering inside a `limit`-sized scan window would mean that once the
// newest `limit` contacts are indexed, repeated backfill calls could never
// reach older unindexed contacts.
describe("ContactsSearchIndexProvider — backfill window", () => {
  interface ChainCall {
    args: unknown[];
    method: string;
  }

  // Thenable query-builder fake: every chained method records itself and
  // `await` resolves through `handler(table, calls)` so tests can answer
  // per-table, per-chain.
  function makeChainedSupabase(
    handler: (table: string, calls: ChainCall[]) => unknown
  ) {
    const chains: { calls: ChainCall[]; table: string }[] = [];
    const makeBuilder = (table: string) => {
      const calls: ChainCall[] = [];
      chains.push({ calls, table });
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: handler(table, calls), error: null }),
      };
      for (const method of [
        "delete",
        "eq",
        "in",
        "is",
        "limit",
        "or",
        "order",
        "select",
        "upsert",
      ]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ args, method });
          return builder;
        };
      }
      return builder;
    };
    const schemaBuilder = { from: (table: string) => makeBuilder(table), rpc: vi.fn() };
    return { chains, supabase: { schema: () => schemaBuilder } };
  }

  it("scans MAX_STATUS_SCAN wide and reaches unindexed contacts beyond the newest `limit`", async () => {
    // Newest-first scan window: c1 is indexed and current; c2/c3 have no
    // embedding row. With limit=1 the old code scanned only c1 and found
    // nothing to do — the fixed code must find c2 (newest missing first).
    const scanRows = [
      { id: "c1", updated_at: "2026-01-03T00:00:00Z" },
      { id: "c2", updated_at: "2026-01-02T00:00:00Z" },
      { id: "c3", updated_at: "2026-01-01T00:00:00Z" },
    ];
    const indexRows = [
      { contact_id: "c1", updated_at: "2026-01-04T00:00:00Z" },
    ];
    const { chains, supabase } = makeChainedSupabase((table, calls) => {
      if (table === "contacts") {
        // The status scan selects "id, updated_at"; document hydration
        // (loadContactsByIds) selects "*" — return nothing there so the
        // backfill takes the delete-document path, which doesn't need
        // mapper-shaped rows.
        const select = calls.find((c) => c.method === "select");
        return select?.args[0] === "id, updated_at" ? scanRows : [];
      }
      if (table === "contact_search_embeddings") {
        return calls.some((c) => c.method === "delete") ? null : indexRows;
      }
      return [];
    });

    const provider = createContactsSearchIndexProvider({
      supabase: supabase as never,
    });

    if (!provider.backfill) {
      throw new Error("provider.backfill is not implemented");
    }
    // The `SearchIndexProvider` contract types backfill's result as
    // `unknown`; the concrete shape is owned by this provider.
    const result = (await provider.backfill({
      limit: 1,
      tenant_id: "tenant-1",
    })) as {
      failed: number;
      processed: number;
      results: { contact_id: string; error?: string; ok: boolean }[];
    };

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    // c2, not c1 (indexed) — and not c3 either: targets are cut to `limit`
    // newest-first AFTER filtering, so the next call would pick up c3.
    expect(result.results).toEqual([{ contact_id: "c2", ok: true }]);

    // The contact scan itself must use the wide window, not `limit`.
    const scanChain = chains.find(
      (chain) =>
        chain.table === "contacts" &&
        chain.calls.some((c) => c.method === "limit")
    );
    const limitCall = scanChain?.calls.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(5000);
  });
});
