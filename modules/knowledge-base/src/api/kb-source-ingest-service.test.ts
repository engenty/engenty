import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runArmedKbSourceIngestions,
  runKbSourceIngestRequest,
} from "./kb-source-ingest-service.js";

/**
 * The shared service behind BOTH the HTTP ingest route and the
 * `kb_source_ingest` gateway operation. The ingestor itself is mocked — these
 * tests pin the request-shaping around it: outcome mapping, ingest_config
 * persistence, and task-outcome reporting.
 */

const ingestKbSource = vi.hoisted(() => vi.fn());
vi.mock("../sources/source-ingestor.js", () => ({
  ingestKbSource,
}));

const source = {
  id: "src-1",
  kb_id: "kb-1",
  name: "Docs",
  ingest_config: {
    agentic_instructions: "",
    category_id: "cat-default",
    template_mode: "inherit",
  },
};

function makeRepos(overrides?: { getById?: () => Promise<unknown> }) {
  return {
    kb: { getById: vi.fn(async () => ({ id: "kb-1", name: "KB" })) },
    sources: {
      getById: vi.fn(overrides?.getById ?? (async () => source)),
      update: vi.fn(async () => source),
    },
  } as never;
}

function reposWithConfig(ingest_config: Record<string, unknown>) {
  return makeRepos({
    getById: async () => ({ ...source, ingest_config }),
  });
}

beforeEach(() => {
  ingestKbSource.mockReset();
});

describe("runKbSourceIngestRequest", () => {
  it("maps a missing source to not_found", async () => {
    const outcome = await runKbSourceIngestRequest({
      auth: undefined,
      body: { strategy: "per_entry" },
      gateway: null,
      repos: makeRepos({ getById: async () => null }),
      sourceId: "missing",
    });
    expect(outcome).toEqual({ status: "not_found" });
    expect(ingestKbSource).not.toHaveBeenCalled();
  });

  it("runs a sync strategy through the ingestor and returns its result", async () => {
    ingestKbSource.mockResolvedValue({
      article_ids: ["art-1", "art-2"],
      ingested_items: 2,
      strategy: "per_entry",
    });
    const repos = makeRepos();

    const outcome = await runKbSourceIngestRequest({
      auth: { principalId: "user-1" } as never,
      body: { strategy: "per_entry", item_ids: ["item-1"] },
      gateway: null,
      repos,
      sourceId: "src-1",
    });

    expect(outcome).toEqual({
      status: "ok",
      result: {
        article_ids: ["art-1", "art-2"],
        ingested_items: 2,
        strategy: "per_entry",
        task_id: undefined,
      },
    });
    expect(ingestKbSource).toHaveBeenCalledWith(
      repos,
      "src-1",
      expect.objectContaining({
        actorPrincipalId: "user-1",
        item_ids: ["item-1"],
        strategy: "per_entry",
      })
    );
  });

  it("persists the template/category choices it was called with", async () => {
    ingestKbSource.mockResolvedValue({
      article_ids: [],
      ingested_items: 0,
      strategy: "per_entry",
    });
    const repos = makeRepos();

    await runKbSourceIngestRequest({
      auth: undefined,
      body: { strategy: "per_entry", category_id: "cat-new" },
      gateway: null,
      repos,
      sourceId: "src-1",
    });

    expect(
      (repos as { sources: { update: ReturnType<typeof vi.fn> } }).sources
        .update
    ).toHaveBeenCalledWith(
      "src-1",
      expect.objectContaining({
        ingest_config: expect.objectContaining({ category_id: "cat-new" }),
      })
    );
  });

  it("maps an ingestor failure to a failed outcome", async () => {
    ingestKbSource.mockRejectedValue(new Error("boom"));

    const outcome = await runKbSourceIngestRequest({
      auth: undefined,
      body: { strategy: "per_entry" },
      gateway: null,
      repos: makeRepos(),
      sourceId: "src-1",
    });

    expect(outcome).toEqual({ status: "failed", message: "boom" });
  });

  it("falls back to the in-process ingestor for agentic runs when no gateway is available", async () => {
    ingestKbSource.mockResolvedValue({
      article_ids: ["art-1"],
      ingested_items: 1,
      strategy: "agentic",
    });

    const outcome = await runKbSourceIngestRequest({
      auth: undefined,
      body: { strategy: "agentic" },
      gateway: null,
      repos: makeRepos(),
      sourceId: "src-1",
    });

    expect(outcome).toMatchObject({
      status: "ok",
      result: { strategy: "agentic", ingested_items: 1 },
    });
    expect(ingestKbSource).toHaveBeenCalled();
  });
});

describe("runArmedKbSourceIngestions", () => {
  it("does nothing when no mode is armed", async () => {
    const outcomes = await runArmedKbSourceIngestions({
      auth: undefined,
      gateway: null,
      repos: reposWithConfig({ template_mode: "inherit" }),
      sourceId: "src-1",
    });
    expect(outcomes).toEqual([]);
    expect(ingestKbSource).not.toHaveBeenCalled();
  });

  it("runs both modes when both are armed", async () => {
    ingestKbSource.mockResolvedValue({
      article_ids: ["a1"],
      ingested_items: 1,
      strategy: "per_entry",
    });
    const outcomes = await runArmedKbSourceIngestions({
      auth: undefined,
      gateway: null,
      repos: reposWithConfig({
        agentic_active: true,
        authored_active: true,
        template_mode: "inherit",
      }),
      sourceId: "src-1",
    });
    expect(outcomes).toHaveLength(2);
    expect(ingestKbSource.mock.calls.map((call) => call[2].strategy)).toEqual([
      "per_entry",
      "agentic",
    ]);
  });

  it("sends strategy only, so the source's own config supplies the rest", async () => {
    ingestKbSource.mockResolvedValue({
      article_ids: [],
      ingested_items: 0,
      strategy: "per_entry",
    });
    await runArmedKbSourceIngestions({
      auth: undefined,
      gateway: null,
      repos: reposWithConfig({
        authored_active: true,
        include_summary: true,
        template_mode: "inherit",
      }),
      sourceId: "src-1",
    });
    const opts = ingestKbSource.mock.calls[0]?.[2];
    expect(opts.strategy).toBe("per_entry");
    expect(opts.include_summary).toBeUndefined();
    expect(opts.attach_original).toBeUndefined();
  });

  it("reports a failing mode without throwing", async () => {
    ingestKbSource.mockRejectedValue(new Error("model unreachable"));
    const outcomes = await runArmedKbSourceIngestions({
      auth: undefined,
      gateway: null,
      repos: reposWithConfig({
        authored_active: true,
        template_mode: "inherit",
      }),
      sourceId: "src-1",
    });
    expect(outcomes).toEqual([
      { message: "model unreachable", status: "failed" },
    ]);
  });
});
