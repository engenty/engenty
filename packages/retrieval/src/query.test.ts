import { describe, expect, it } from "vitest";
import type { RetrievalMatch } from "./contracts.js";
import { isFastPathQuery, type QueryDeps, runQuery } from "./query.js";
import {
  createFakeEmbedder,
  createFakeSupabase,
  makeSource,
} from "./test-utils.js";

function makeDeps(options?: {
  rpcData?: unknown;
  sources?: ReturnType<typeof makeSource>[];
}) {
  const supabase = createFakeSupabase({ rpcData: options?.rpcData });
  const { calls, embedder } = createFakeEmbedder();
  const sources = new Map(
    (options?.sources ?? [makeSource()]).map((source) => [
      source.source_type,
      source,
    ])
  );
  const deps: QueryDeps = {
    resolveEmbedder: () => Promise.resolve(embedder),
    sources,
    supabase: supabase as never,
  };
  return { deps, embedCalls: calls, supabase };
}

const rpcMatch = (overrides: Partial<RetrievalMatch> = {}) => ({
  chunk_id: "doc-1::chunk::0",
  chunk_index: 0,
  doc_id: "doc-1",
  matched_fields: ["text"],
  metadata: {},
  module: "demo",
  occurred_at: null,
  score: 1.5,
  source_scores: { fts: 0.75, trigram: 0, vector: 0 },
  source_type: "demo.item",
  text: "hello",
  title: null,
  ...overrides,
});

describe("fast path", () => {
  it("2-term query at maxTerms=2 stays lexical — no embedding call", async () => {
    const source = makeSource({ retriever: { fastPath: { maxTerms: 2 } } });
    const { deps, embedCalls, supabase } = makeDeps({ sources: [source] });
    await runQuery(deps, {
      filters: { tenant_id: "tenant-1" },
      limit: 10,
      query: "quick search",
    });
    expect(embedCalls).toEqual([]);
    expect(supabase.rpc.calls[0]?.args.p_query_embedding).toBeNull();
  });

  it("3-term query embeds and forwards the vector + model", async () => {
    const source = makeSource({ retriever: { fastPath: { maxTerms: 2 } } });
    const { deps, embedCalls, supabase } = makeDeps({ sources: [source] });
    await runQuery(deps, {
      filters: { tenant_id: "tenant-1", user_id: "user-1" },
      limit: 10,
      query: "which supplier delivered late",
    });
    expect(embedCalls).toHaveLength(1);
    const args = supabase.rpc.calls[0]?.args;
    expect(args?.p_query_embedding).toBeTypeOf("string");
    expect(args?.p_embedding_model).toBe("fake/embed-3");
    expect(args?.p_user_id).toBe("user-1");
    expect(args?.p_source_types).toEqual(["demo.item"]);
  });

  it("no fastPath configured means no fast path", () => {
    expect(isFastPathQuery([makeSource()], "one")).toBe(false);
  });
});

describe("degradation and guards", () => {
  it("embedding failure degrades to lexical instead of throwing", async () => {
    const { deps, supabase } = makeDeps();
    deps.resolveEmbedder = () => Promise.reject(new Error("gateway down"));
    const response = await runQuery(deps, {
      filters: { tenant_id: "tenant-1" },
      limit: 10,
      query: "real question here",
    });
    expect(response).toEqual({ results: [], total: 0 });
    expect(supabase.rpc.calls[0]?.args.p_query_embedding).toBeNull();
  });

  it("missing tenant returns empty without touching the RPC", async () => {
    const { deps, supabase } = makeDeps();
    const response = await runQuery(deps, { limit: 10, query: "x" });
    expect(response).toEqual({ results: [], total: 0 });
    expect(supabase.rpc.calls).toHaveLength(0);
  });
});

describe("evaluators and hydrate (single-source only)", () => {
  it("an evaluator can drop matches", async () => {
    const source = makeSource({
      retriever: {
        evaluators: [
          {
            evaluate: (matches) =>
              Promise.resolve(matches.filter((m) => m.doc_id !== "doc-1")),
            id: "drop-doc-1",
          },
        ],
      },
    });
    const { deps } = makeDeps({
      rpcData: {
        matches: [
          rpcMatch(),
          rpcMatch({ chunk_id: "doc-2::chunk::0", doc_id: "doc-2" }),
        ],
        total: 2,
      },
      sources: [source],
    });
    const response = await runQuery(deps, {
      filters: { tenant_id: "tenant-1" },
      limit: 10,
      query: "hello",
    });
    expect(
      response.results.map((r) => (r.item as RetrievalMatch).doc_id)
    ).toEqual(["doc-2"]);
  });

  it("evaluator shouldRun=false skips it; hydrate maps items", async () => {
    const source = makeSource({
      retriever: {
        evaluators: [
          {
            evaluate: () => Promise.resolve([]),
            id: "never-runs",
            shouldRun: () => false,
          },
        ],
        hydrate: (matches) =>
          Promise.resolve(
            matches.map((match) => ({
              item: { hydrated: match.doc_id },
              matched_fields: match.matched_fields,
              score: match.score,
              source_scores: { ...match.source_scores },
            }))
          ),
      },
    });
    const { deps } = makeDeps({
      rpcData: { matches: [rpcMatch()], total: 1 },
      sources: [source],
    });
    const response = await runQuery(deps, {
      filters: { tenant_id: "tenant-1" },
      limit: 10,
      query: "hello",
    });
    expect(response.results[0]?.item).toEqual({ hydrated: "doc-1" });
  });
});
