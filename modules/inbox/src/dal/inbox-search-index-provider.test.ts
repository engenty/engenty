// Lean coverage for the hybrid `InboxSearchIndexProvider`. Mirrors the
// contacts provider test: we verify the provider's _decisions_ (when to
// embed, what to send, tenant guards), not the RPC's ranking — that is owned
// by `module_inbox.search_messages`.

import { describe, expect, it, vi } from "vitest";
import { createInboxSearchIndexProvider } from "./inbox-search-index-provider.js";

// Module-level mocks for the AI SDK so the embedder never issues a real
// embed call. The `lexical` test below asserts these are NOT called.
vi.mock("ai", () => ({
  embed: vi.fn(async () => ({ embedding: [0.1, 0.2, 0.3] })),
  embedMany: vi.fn(async (input: { values: string[] }) => ({
    embeddings: input.values.map(() => [0.1, 0.2, 0.3]),
  })),
}));

async function aiMocks() {
  return (await import("ai")) as unknown as {
    embed: ReturnType<typeof vi.fn>;
    embedMany: ReturnType<typeof vi.fn>;
  };
}

function makeFakeSupabase() {
  const rpc = vi.fn().mockResolvedValue({
    data: { matches: [], total: 0 },
    error: null,
  });
  const tableBuilder = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const schemaBuilder = {
    from: vi.fn(() => tableBuilder),
    rpc,
  };
  return {
    rpc,
    schema: vi.fn(() => schemaBuilder),
    tableBuilder,
  };
}

describe("InboxSearchIndexProvider — strategy handling", () => {
  it("skips the embedder when strategy='lexical' is explicit", async () => {
    const supabase = makeFakeSupabase();
    const ai = await aiMocks();
    ai.embed.mockClear();
    ai.embedMany.mockClear();

    const provider = createInboxSearchIndexProvider({
      supabase: supabase as never,
    });
    await provider.search({
      filters: { tenant_id: "tenant-1", user_id: "user-1" },
      limit: 10,
      query: "invoice",
      strategy: "lexical",
    });

    expect(ai.embed).not.toHaveBeenCalled();
    expect(ai.embedMany).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith(
      "search_messages",
      expect.objectContaining({ p_query_embedding: null })
    );
  });

  it("embeds the query and forwards the vector on hybrid (default)", async () => {
    const supabase = makeFakeSupabase();
    const ai = await aiMocks();
    ai.embed.mockClear();

    const provider = createInboxSearchIndexProvider({
      supabase: supabase as never,
    });
    await provider.search({
      filters: { tenant_id: "tenant-1", user_id: "user-1" },
      limit: 10,
      query: "which supplier asked about the July delivery?",
    });

    expect(ai.embed).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "search_messages",
      expect.objectContaining({
        p_query_embedding: JSON.stringify([0.1, 0.2, 0.3]),
        p_tenant_id: "tenant-1",
        p_user_id: "user-1",
      })
    );
  });

  it("falls back to lexical when query embedding fails", async () => {
    const supabase = makeFakeSupabase();
    const ai = await aiMocks();
    ai.embed.mockRejectedValueOnce(new Error("embed provider down"));

    const provider = createInboxSearchIndexProvider({
      supabase: supabase as never,
    });
    const response = await provider.search({
      filters: { tenant_id: "tenant-1" },
      limit: 10,
      query: "invoice",
    });

    expect(response).toEqual({ results: [], total: 0 });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "search_messages",
      expect.objectContaining({ p_query_embedding: null })
    );
  });
});

describe("InboxSearchIndexProvider — tenant guards", () => {
  it("returns empty without a tenant_id and never hits the RPC", async () => {
    const supabase = makeFakeSupabase();
    const provider = createInboxSearchIndexProvider({
      supabase: supabase as never,
    });
    const response = await provider.search({ limit: 10, query: "invoice" });
    expect(response).toEqual({ results: [], total: 0 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("replaceDocument with empty text deletes the embedding row", async () => {
    const supabase = makeFakeSupabase();
    const ai = await aiMocks();
    ai.embed.mockClear();

    const provider = createInboxSearchIndexProvider({
      supabase: supabase as never,
    });
    await provider.replaceDocument({
      document: {
        doc_id: "msg-1",
        source_id: "msg-1",
        source_type: "inbox.message",
        tenant_id: "tenant-1",
        text: "   ",
      },
    });

    expect(ai.embed).not.toHaveBeenCalled();
    expect(supabase.tableBuilder.delete).toHaveBeenCalled();
    expect(supabase.tableBuilder.upsert).not.toHaveBeenCalled();
  });

  it("replaceDocument embeds and upserts with owner metadata", async () => {
    const supabase = makeFakeSupabase();
    const provider = createInboxSearchIndexProvider({
      supabase: supabase as never,
    });
    await provider.replaceDocument({
      document: {
        doc_id: "msg-1",
        metadata: { owner_user_id: "user-9" },
        scope_id: "default",
        source_id: "msg-1",
        source_type: "inbox.message",
        tenant_id: "tenant-1",
        text: "Subject: hello",
      },
    });

    expect(supabase.tableBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        message_id: "msg-1",
        owner_user_id: "user-9",
        tenant_id: "tenant-1",
      }),
      { onConflict: "message_id" }
    );
  });
});
