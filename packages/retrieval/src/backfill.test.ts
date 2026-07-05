import { describe, expect, it } from "vitest";
import { runBackfill } from "./backfill.js";
import { createRetrievalStore } from "./store.js";
import {
  createFakeEmbedder,
  createFakeSupabase,
  makeDocument,
  makeSource,
} from "./test-utils.js";

const T1 = "2026-07-01T00:00:00Z";
const T2 = "2026-07-02T00:00:00Z";
const T3 = "2026-07-03T00:00:00Z";

function setup(options: {
  indexed?: { content_updated_at: string; doc_id: string }[];
  sourceDocs: { doc_id: string; updated_at: string }[];
}) {
  const supabase = createFakeSupabase({
    tables: {
      documents: (options.indexed ?? []).map((row) => ({
        ...row,
        indexed_at: row.content_updated_at,
      })),
    },
  });
  const { calls, embedder } = createFakeEmbedder();
  const built: string[] = [];
  const source = makeSource({
    buildDocument: ({ doc_id }) => {
      built.push(doc_id);
      return Promise.resolve(
        makeDocument({ doc_id, source_id: doc_id, text: `body of ${doc_id}` })
      );
    },
    listDocuments: () => Promise.resolve(options.sourceDocs),
  });
  return {
    built,
    deps: {
      resolveEmbedder: () => Promise.resolve(embedder),
      source,
      store: createRetrievalStore(supabase as never),
    },
    embedCalls: calls,
    supabase,
  };
}

describe("runBackfill", () => {
  it("scan-wide/work-narrow: an old missing doc beyond the work limit is picked up next run", async () => {
    // newest (a) is indexed+current; b and c are missing; limit 1 must pick b
    // (newest pending), NOT stall on the already-indexed window head.
    const { built, deps } = setup({
      indexed: [{ content_updated_at: T3, doc_id: "a" }],
      sourceDocs: [
        { doc_id: "a", updated_at: T3 },
        { doc_id: "b", updated_at: T2 },
        { doc_id: "c", updated_at: T1 },
      ],
    });
    const result = await runBackfill(deps, { limit: 1, tenant_id: "tenant-1" });
    expect(built).toEqual(["b"]);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("stale docs (index older than source) are re-embedded; force re-embeds current too", async () => {
    const { built, deps } = setup({
      indexed: [
        { content_updated_at: T1, doc_id: "a" }, // stale (source at T3)
        { content_updated_at: T2, doc_id: "b" }, // current
      ],
      sourceDocs: [
        { doc_id: "a", updated_at: T3 },
        { doc_id: "b", updated_at: T2 },
      ],
    });
    await runBackfill(deps, { tenant_id: "tenant-1" });
    expect(built).toEqual(["a"]);

    built.length = 0;
    await runBackfill(deps, { force: true, tenant_id: "tenant-1" });
    expect(built.toSorted()).toEqual(["a", "b"]);
  });

  it("a build failure records the doc as failed without aborting the batch", async () => {
    const { deps, embedCalls } = setup({
      sourceDocs: [
        { doc_id: "bad", updated_at: T3 },
        { doc_id: "good", updated_at: T2 },
      ],
    });
    const originalBuild = deps.source.buildDocument;
    deps.source = {
      ...deps.source,
      buildDocument: (input) =>
        input.doc_id === "bad"
          ? Promise.reject(new Error("boom"))
          : originalBuild(input),
    };
    const result = await runBackfill(deps, { tenant_id: "tenant-1" });
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(
      result.results.find((entry) => entry.doc_id === "bad")?.error
    ).toContain("boom");
    // The good doc still got embedded in the batched pass.
    expect(embedCalls.flat()).toContain("body of good");
  });

  it("embeds all pending chunks in one batched pass", async () => {
    const { deps, embedCalls } = setup({
      sourceDocs: [
        { doc_id: "a", updated_at: T3 },
        { doc_id: "b", updated_at: T2 },
      ],
    });
    await runBackfill(deps, { tenant_id: "tenant-1" });
    expect(embedCalls).toHaveLength(1);
    expect(embedCalls[0]).toEqual(["body of a", "body of b"]);
  });
});
