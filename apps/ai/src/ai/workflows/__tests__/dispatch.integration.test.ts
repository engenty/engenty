// Graph-action runtime, end to end against the real pg snapshot store.
//
// This is the Phase-1 exit gate in unit-test form: a graph that gates, gets
// approved, and writes — with the resume happening on a SEPARATE rehydration of
// the same stored JSON, which is what a process restart looks like from the
// workflow's point of view.
//
// Skipped when SUPABASE_DB_URL is unset (CI without a database) rather than
// failing, so the suite stays runnable everywhere.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const DB_URL = process.env.SUPABASE_DB_URL?.trim();
const describeIfDb = DB_URL ? describe : describe.skip;

// The module operation invoker is the only outbound seam; everything else is
// real (Mastra, the pg store, the primitives, rehydration).
const invoke = vi.fn<(op: string, input?: Record<string, unknown>) => unknown>(
  () => ({ ok: true })
);
const setStatus = vi.fn(async () => undefined);

vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));
vi.mock("../../jobs/task-job-scope.js", () => ({
  resolveTaskJobServiceScope: async (tenantId: string) => ({
    tenantId,
    userId: "service-user",
  }),
}));
vi.mock("../../index.js", () => ({
  createWorkflowRunStoreFromEnv: () => ({ setStatus }),
  createAgentRunStoreFromEnv: () => null,
  createRegistryStoreFromEnv: () => null,
  createThreadStoreFromEnv: () => null,
}));

/**
 * Build the stored JSON for: prepare a patch → gate → apply it.
 * Authored the way the designer will author it — mapping constants feeding
 * each primitive, so this doubles as a fixture for the validator's rules.
 */
function buildStoredGraph(id: string) {
  return {
    id,
    inputSchema: {
      type: "object",
      properties: { amount: { type: "number" } },
      required: ["amount"],
    },
    outputSchema: {
      type: "object",
      properties: { applied: { type: "number" } },
    },
    graph: [
      {
        type: "mapping",
        id: "prep-gate",
        mapConfig: JSON.stringify({
          kind: { value: "field_updates" },
          title: { value: "Apply the proposed status?" },
          payload: { value: { status: "sent" } },
        }),
      },
      { type: "tool", id: "gate", toolId: "approval_gate" },
      {
        type: "mapping",
        id: "prep-apply",
        mapConfig: JSON.stringify({
          patch: { step: "gate", path: "data" },
        }),
      },
      { type: "tool", id: "apply", toolId: "apply_field_updates" },
    ],
  };
}

// Runs against the real `ai` schema Mastra already uses — the snapshot rows are
// keyed by throwaway run ids, so they neither collide with nor outlive anything
// that matters.
describeIfDb("graph action dispatch (integration)", () => {
  it("gates, survives a fresh rehydration, resumes and writes", async () => {
    const { resumeGraphRun, startGraphRun } = await import("../dispatch.js");

    const graphId = randomUUID();
    const version = {
      workflow_id: graphId,
      allowed_tools: null,
      approved_at: new Date().toISOString(),
      approved_by_user_id: null,
      authored_by: "user" as const,
      created_at: new Date().toISOString(),
      created_by_user_id: null,
      graph: buildStoredGraph(`workflow:${graphId}`),
      id: randomUUID(),
      input_schema: {},
      output_schema: {},
      tenant_id: "tenant-a",
      version: 1,
    };

    const ctx = {
      workflowId: graphId,
      workflowVersion: 1,
      contextId: "offer-42",
      contextType: "offers.offer",
      requestId: randomUUID(),
      tenantId: "tenant-a",
      threadId: randomUUID(),
    };
    const runId = randomUUID();

    // 1. Start — the gate suspends the run.
    const started = await startGraphRun({
      ctx,
      input: { amount: 4800 },
      runId,
      version,
    });
    expect(started.status).toBe("suspended");
    expect(started.gate?.stepId).toBe("gate");
    expect(started.gate?.title).toBe("Apply the proposed status?");
    // The gate marked the audit row before suspending.
    expect(setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "requires_action" })
    );
    // Nothing was written — the whole point of gating before the write.
    expect(invoke).not.toHaveBeenCalled();

    // 2. Resume through a SEPARATE rehydration of the same stored JSON. This is
    // what a process restart looks like: no in-memory workflow survives.
    const resumed = await resumeGraphRun({
      ctx,
      resumeData: { approved: true, data: { status: "sent" } },
      runId,
      stepId: started.gate?.stepId ?? "gate",
      version,
    });

    expect(resumed.status).toBe("success");
    // The approved patch reached the subject's module update operation.
    expect(invoke).toHaveBeenCalledWith("offers_update", {
      id: "offer-42",
      patch: { status: "sent" },
    });
  });

  it("a rejected gate does not write", async () => {
    const { resumeGraphRun, startGraphRun } = await import("../dispatch.js");
    invoke.mockClear();

    const graphId = randomUUID();
    const version = {
      workflow_id: graphId,
      allowed_tools: null,
      approved_at: new Date().toISOString(),
      approved_by_user_id: null,
      authored_by: "user" as const,
      created_at: new Date().toISOString(),
      created_by_user_id: null,
      graph: buildStoredGraph(`workflow:${graphId}`),
      id: randomUUID(),
      input_schema: {},
      output_schema: {},
      tenant_id: "tenant-a",
      version: 1,
    };
    const ctx = {
      workflowId: graphId,
      workflowVersion: 1,
      contextId: "offer-99",
      contextType: "offers.offer",
      requestId: randomUUID(),
      tenantId: "tenant-a",
      threadId: randomUUID(),
    };
    const runId = randomUUID();

    await startGraphRun({ ctx, input: { amount: 10 }, runId, version });
    const resumed = await resumeGraphRun({
      ctx,
      resumeData: { approved: false, reason: "wrong amount" },
      runId,
      stepId: "gate",
      version,
    });

    expect(resumed.status).toBe("success");
    // Rejection maps to an empty patch, and an empty patch is a no-op write.
    expect(invoke).not.toHaveBeenCalled();
  });
});
