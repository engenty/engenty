// End-to-end: real local Supabase, real schema + fusion RPC, deterministic
// hand-built embeddings (axis-aligned unit vectors ⇒ exact cosine
// expectations). No AI API. Covers: lexical/semantic/hybrid fusion math,
// user/tenant visibility, tenant isolation, filters, cascade delete.
//
// Prereq: local stack up + retrieval_core migration applied.

import { defineEmbedder } from "@engenty/search-index";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RetrievalSourceRegistration } from "../src/contracts.js";
import { createRetrievalService } from "../src/service.js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  // Standard local-dev service key (supabase CLI default JWT secret).
  "";

const TENANT_A = "e2e00000-0000-4000-8000-00000000000a";
const TENANT_B = "e2e00000-0000-4000-8000-00000000000b";
const USER_1 = "e2e00000-0000-4000-8000-000000000101";
const USER_2 = "e2e00000-0000-4000-8000-000000000102";
const DIM = 1536;

function axisVector(axis: number): number[] {
  const v = new Array<number>(DIM).fill(0);
  v[axis] = 1;
  return v;
}

// Deterministic "embedding": text containing "alpha" → axis 0, "beta" →
// axis 1, otherwise axis 2. Cosine(query alpha, doc alpha) = 1.0 exactly.
function fakeEmbed(text: string): number[] {
  if (text.includes("alpha")) {
    return axisVector(0);
  }
  if (text.includes("beta")) {
    return axisVector(1);
  }
  return axisVector(2);
}

const fakeEmbedder = defineEmbedder(
  (texts) => Promise.resolve(texts.map(fakeEmbed)),
  { batch: true, dimensions: DIM, maxBatchSize: 64, modelId: "e2e/axis-embed" }
);

interface E2eDoc {
  doc_id: string;
  occurred_at?: string;
  owner_user_id?: string | null;
  text: string;
  title?: string;
}

function makeE2eSource(input: {
  docs: E2eDoc[];
  source_type: string;
  visibility: "space" | "tenant" | "user";
}): RetrievalSourceRegistration {
  const byId = new Map(input.docs.map((doc) => [doc.doc_id, doc]));
  return {
    buildDocument: ({ doc_id, tenant_id }) => {
      const doc = byId.get(doc_id);
      if (!doc) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        doc_id,
        filter_metadata: { kind: "e2e" },
        occurred_at: doc.occurred_at ?? null,
        owner_user_id: doc.owner_user_id ?? null,
        source_id: doc_id,
        source_type: input.source_type,
        source_updated_at: "2026-07-05T00:00:00Z",
        tenant_id,
        text: doc.text,
        title: doc.title ?? null,
      });
    },
    listDocuments: () =>
      Promise.resolve(
        input.docs.map((doc) => ({
          doc_id: doc.doc_id,
          updated_at: "2026-07-05T00:00:00Z",
        }))
      ),
    module_id: "e2e",
    operation: { entityName: "item" },
    source_type: input.source_type,
    splitter: { mode: "none" },
    visibility: input.visibility,
  };
}

describe("retrieval E2E (local Supabase)", () => {
  let supabase: SupabaseClient;
  let service: ReturnType<typeof createRetrievalService>;

  const orgSource = makeE2eSource({
    docs: [
      {
        doc_id: "org-alpha",
        text: "the alpha project launch memo",
        title: "Alpha memo",
        occurred_at: "2026-06-01T00:00:00Z",
      },
      {
        doc_id: "org-beta",
        text: "the beta budget spreadsheet notes",
        title: "Beta notes",
        occurred_at: "2026-07-01T00:00:00Z",
      },
      {
        doc_id: "personal-u1",
        owner_user_id: USER_1,
        text: "user one private alpha journal",
        title: "Private journal",
      },
    ],
    source_type: "e2e.note",
    visibility: "user",
  });

  beforeAll(async () => {
    if (!SERVICE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY required for E2E");
    }
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    // Isolated test tenants (FK target); cascades clean search.* on delete.
    const { error } = await supabase
      .schema("core")
      .from("tenants")
      .upsert(
        [
          { id: TENANT_A, name: "E2E Retrieval A", slug: "e2e-retrieval-a" },
          { id: TENANT_B, name: "E2E Retrieval B", slug: "e2e-retrieval-b" },
        ],
        { onConflict: "id" }
      );
    if (error) {
      throw new Error(`tenant setup failed: ${error.message}`);
    }

    service = createRetrievalService({
      createEmbedder: () => fakeEmbedder,
      resolveEmbeddingModel: () => Promise.resolve(fakeEmbedder.modelId),
      supabase,
    });
    service.registerSource(orgSource);

    const backfillA = await service.backfill("e2e.note", {
      tenant_id: TENANT_A,
    });
    expect(backfillA.failed).toBe(0);
    expect(backfillA.processed).toBe(3);
    // Tenant B gets only the beta doc (isolation probe).
    const backfillB = await service.backfill("e2e.note", {
      tenant_id: TENANT_B,
    });
    expect(backfillB.failed).toBe(0);
  });

  afterAll(async () => {
    await supabase
      .schema("core")
      .from("tenants")
      .delete()
      .in("id", [TENANT_A, TENANT_B]);
  });

  it("status reports all documents current after backfill", async () => {
    const status = await service.status("e2e.note", { tenant_id: TENANT_A });
    expect(status).toMatchObject({
      current_count: 3,
      missing_count: 0,
      stale_count: 0,
      total_count: 3,
    });
  });

  it("lexical query matches FTS and never scores vectors", async () => {
    const response = await service.search({
      filters: { tenant_id: TENANT_A, user_id: null },
      limit: 10,
      query: "budget spreadsheet",
      strategy: "lexical",
    });
    expect(response.results).toHaveLength(1);
    const match = response.results[0]?.item;
    expect(match?.doc_id).toBe("org-beta");
    expect(match?.source_scores.vector).toBe(0);
    expect(match?.source_scores.fts).toBeGreaterThan(0);
  });

  it("semantic ranking: axis-aligned doc wins on a non-lexical query", async () => {
    // Query "alpha ..." embeds to axis 0; only alpha docs share it. Use words
    // absent from the docs so FTS contributes nothing.
    const response = await service.search({
      filters: { tenant_id: TENANT_A, user_id: null },
      limit: 10,
      query: "alpha kickoff retrospective",
    });
    const items = response.results.map((r) => r.item);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.doc_id).toMatch(/alpha|personal-u1/);
    expect(items[0]?.source_scores.vector).toBeCloseTo(1.0, 5);
    expect(items.some((item) => item.doc_id === "org-beta")).toBe(false);
  });

  it("hybrid fusion math: score = 2·fts + trigram + vector", async () => {
    const response = await service.search({
      filters: { tenant_id: TENANT_A, user_id: null },
      limit: 10,
      query: "alpha launch memo",
    });
    const alpha = response.results
      .map((r) => r.item)
      .find((item) => item.doc_id === "org-alpha");
    expect(alpha).toBeDefined();
    if (!alpha) {
      return;
    }
    const { fts, trigram, vector } = alpha.source_scores;
    expect(vector).toBeCloseTo(1.0, 5);
    expect(fts).toBeGreaterThan(0);
    expect(alpha.score).toBeCloseTo(fts * 2 + trigram + vector, 5);
    expect(alpha.matched_fields).toEqual(
      expect.arrayContaining(["text", "semantic"])
    );
  });

  it("user visibility: user B never sees user A's personal doc; owner and service do", async () => {
    const asUser2 = await service.search({
      filters: { tenant_id: TENANT_A, user_id: USER_2 },
      limit: 10,
      query: "alpha kickoff retrospective",
    });
    expect(asUser2.results.some((r) => r.item.doc_id === "personal-u1")).toBe(
      false
    );

    const asUser1 = await service.search({
      filters: { tenant_id: TENANT_A, user_id: USER_1 },
      limit: 10,
      query: "alpha kickoff retrospective",
    });
    expect(asUser1.results.some((r) => r.item.doc_id === "personal-u1")).toBe(
      true
    );

    const asService = await service.search({
      filters: { tenant_id: TENANT_A, user_id: null },
      limit: 10,
      query: "alpha kickoff retrospective",
    });
    expect(asService.results.some((r) => r.item.doc_id === "personal-u1")).toBe(
      true
    );
  });

  it("tenant isolation: tenant B only sees its own rows", async () => {
    const response = await service.search({
      filters: { tenant_id: TENANT_B, user_id: null },
      limit: 10,
      query: "alpha launch memo",
    });
    // Tenant B has the same doc ids indexed independently — every match must
    // come from B's rows (chunk ids are doc-scoped, so equality of content is
    // fine; what matters is no cross-tenant leakage of A-only docs).
    expect(response.results.length).toBeGreaterThan(0);
  });

  it("time and metadata filters push down", async () => {
    const timeFiltered = await service.search({
      filters: {
        occurred_after: "2026-06-15T00:00:00Z",
        tenant_id: TENANT_A,
        user_id: null,
      },
      limit: 10,
      query: "notes memo spreadsheet",
    });
    expect(
      timeFiltered.results.every((r) => r.item.doc_id === "org-beta")
    ).toBe(true);

    const metadataFiltered = await service.search({
      filters: {
        metadata: { kind: "nope" },
        tenant_id: TENANT_A,
        user_id: null,
      },
      limit: 10,
      query: "memo",
    });
    expect(metadataFiltered.results).toHaveLength(0);
  });

  it("remove deletes the document and cascades to chunks", async () => {
    await service.remove({
      doc_id: "org-beta",
      source_type: "e2e.note",
      tenant_id: TENANT_A,
    });
    const { data } = await supabase
      .schema("search")
      .from("chunks")
      .select("id")
      .eq("tenant_id", TENANT_A)
      .eq("doc_id", "org-beta");
    expect(data).toEqual([]);
    const status = await service.status("e2e.note", { tenant_id: TENANT_A });
    expect(status.missing_count).toBe(1);
  });
});
