// Lean coverage for the `memory.record` retrieval source. The central service
// owns embedding/fusion/backfill (tested in @engenty/retrieval); here we test
// the memory-specific decisions:
//
//   1. `buildDocument` — only ACTIVE records index (proposed/archived → null,
//      so a replace event drops them), text = title + body, scope filters as
//      chunk metadata.
//   2. `mapFilters` — scope_kind/scope_ref/kind become metadata equality
//      filters applied inside the fused query.
//   3. `hydrate` — fused matches map back to MemoryRecord rows, non-active
//      rows and duplicates drop.

import type { RetrievalMatch } from "@engenty/retrieval";
import { describe, expect, it } from "vitest";
import { createMemoryRetrievalSource } from "./memory-retrieval-source.js";

function createFakeSupabase(rows: Record<string, unknown>[]) {
  function builder() {
    const b: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "order", "limit"]) {
      b[method] = () => b;
    }
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable Supabase query mock
    b.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    return b;
  }
  return { schema: () => ({ from: () => builder() }) };
}

function memoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    tenant_id: "tenant-1",
    scope_id: "default",
    scope_kind: "user",
    scope_ref: "user-1",
    kind: "preference",
    slug: "prefers-brief-emails",
    title: "Prefers brief emails",
    body_md: "Outbound emails ≤ 5 sentences, no pleasantries.",
    source_kind: "agent",
    agent_type_key: "engenty.copilot",
    confidence: "high",
    status: "active",
    supersedes: null,
    created_by: "user-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

describe("memory retrieval source — buildDocument", () => {
  it("builds title+body documents with scope filter metadata", async () => {
    const source = createMemoryRetrievalSource({
      getDb: () => createFakeSupabase([memoryRow()]) as any,
    });
    const doc = await source.buildDocument({
      doc_id: "m1",
      tenant_id: "tenant-1",
    });
    expect(doc).not.toBeNull();
    expect(doc?.title).toBe("Prefers brief emails");
    expect(doc?.text).toBe(
      "Prefers brief emails\n\nOutbound emails ≤ 5 sentences, no pleasantries."
    );
    expect(doc?.filter_metadata).toEqual({
      kind: "preference",
      scope_kind: "user",
      scope_ref: "user-1",
      confidence: "high",
    });
    expect(doc?.entity_refs).toEqual(["memory:record:m1"]);
    expect(doc?.scope_id).toBe("default");
  });

  it("omits scope_ref metadata for org records (null ref)", async () => {
    const source = createMemoryRetrievalSource({
      getDb: () =>
        createFakeSupabase([
          memoryRow({ scope_kind: "org", scope_ref: null }),
        ]) as any,
    });
    const doc = await source.buildDocument({
      doc_id: "m1",
      tenant_id: "tenant-1",
    });
    expect(doc?.filter_metadata).not.toHaveProperty("scope_ref");
  });

  it.each([
    "proposed",
    "archived",
  ])("returns null for %s records so they drop from the index", async (status) => {
    const source = createMemoryRetrievalSource({
      getDb: () => createFakeSupabase([memoryRow({ status })]) as any,
    });
    const doc = await source.buildDocument({
      doc_id: "m1",
      tenant_id: "tenant-1",
    });
    expect(doc).toBeNull();
  });
});

describe("memory retrieval source — mapFilters", () => {
  const source = createMemoryRetrievalSource({
    getDb: () => createFakeSupabase([]) as any,
  });

  it("maps scope and kind filters to chunk metadata", () => {
    const mapped = source.retriever?.mapFilters?.({
      scope_kind: "entity",
      scope_ref: "contacts.person:abc",
      kind: "lesson",
    });
    expect(mapped?.metadata).toEqual({
      scope_kind: "entity",
      scope_ref: "contacts.person:abc",
      kind: "lesson",
    });
  });

  it("returns no metadata for empty filters", () => {
    const mapped = source.retriever?.mapFilters?.({});
    expect(mapped?.metadata).toBeUndefined();
  });
});

describe("memory retrieval source — hydrate", () => {
  function match(docId: string): RetrievalMatch {
    return {
      chunk_id: `${docId}-c0`,
      doc_id: docId,
      matched_fields: ["text"],
      score: 0.9,
      source_scores: { fts: 0.9, trigram: 0, vector: 0 },
    } as unknown as RetrievalMatch;
  }

  it("hydrates matches into records, dropping non-active rows and dupes", async () => {
    const source = createMemoryRetrievalSource({
      getDb: () =>
        createFakeSupabase([
          memoryRow(),
          memoryRow({ id: "m2", slug: "acme-tone", status: "archived" }),
        ]) as any,
    });
    const results = await source.retriever?.hydrate?.(
      [match("m1"), match("m1"), match("m2")],
      { tenant_id: "tenant-1" } as never
    );
    expect(results).toHaveLength(1);
    expect(results?.[0]?.item.record.id).toBe("m1");
    expect(results?.[0]?.score).toBe(0.9);
  });
});
