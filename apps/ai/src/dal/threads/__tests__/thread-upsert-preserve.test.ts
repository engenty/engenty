import { describe, expect, it, vi } from "vitest";
import { preservedThreadUpsertFields } from "../thread-upsert-preserve.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";

function store(row: Record<string, unknown> | null) {
  return {
    getThread: vi.fn(async () => row as never),
  };
}

describe("preservedThreadUpsertFields", () => {
  it("keeps the Mastra state a re-upsert would otherwise erase", async () => {
    // The working-memory pointers and the observational cursor live in this
    // column. Losing them reads as "the agent ran and remembered nothing" —
    // a model problem, until you look at the row.
    const mastra = { om: { observedUpTo: 42 }, stateSignals: { wm: 1 } };
    const preserved = await preservedThreadUpsertFields({
      metadata: { source: "task-job" },
      store: store({ metadata: { mastra }, summary: "what it did" }),
      tenantId: TENANT,
      threadId: THREAD,
    });
    expect(preserved.metadata).toEqual({ mastra, source: "task-job" });
    expect(preserved.summary).toBe("what it did");
  });

  it("lets the caller's own keys win", async () => {
    const preserved = await preservedThreadUpsertFields({
      metadata: { source: "workflow-run" },
      store: store({ metadata: { source: "task-job", keep: true } }),
      tenantId: TENANT,
      threadId: THREAD,
    });
    expect(preserved.metadata).toEqual({ keep: true, source: "workflow-run" });
  });

  it("is just the caller's keys for a thread that does not exist yet", async () => {
    const preserved = await preservedThreadUpsertFields({
      metadata: { source: "workflow-run" },
      store: store(null),
      tenantId: TENANT,
      threadId: THREAD,
    });
    expect(preserved).toEqual({ metadata: { source: "workflow-run" } });
  });

  it("does not cost the caller its own keys when the read fails", async () => {
    const preserved = await preservedThreadUpsertFields({
      metadata: { source: "workflow-run" },
      store: {
        getThread: vi.fn(async () => {
          throw new Error("thread read failed");
        }),
      },
      tenantId: TENANT,
      threadId: THREAD,
    });
    expect(preserved.metadata).toEqual({ source: "workflow-run" });
  });
});
