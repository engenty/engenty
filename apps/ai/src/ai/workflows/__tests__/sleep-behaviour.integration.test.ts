// What actually happens to a run that sleeps?
//
// Mastra's `sleep` / `sleepUntil` entries do NOT suspend: the default engine's
// `executeSleepDuration` is an in-process `abortableSleep`, and the `suspend`
// handed to a dynamic sleep `fn` is an explicit no-op. That is the whole reason
// a long wait is a `wait_until` node instead — see MAX_SLEEP_MS in
// validate-graph.ts, and wait-until.ts for the durable path.
//
// This test pins the sleep half of that split, so a Mastra upgrade that changes
// it fails here rather than silently stranding scheduled work in production.
// The engine's own docblock invites the change ("Override to use
// platform-specific sleep primitives"): an engine that overrides it makes
// `sleep` durable, and this test is where that shows up first.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const DB_URL = process.env.SUPABASE_DB_URL?.trim();
const describeIfDb = DB_URL ? describe : describe.skip;

const invoke = vi.fn<(op: string, input?: Record<string, unknown>) => unknown>(
  () => ({ ok: true })
);

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
  createWorkflowRunStoreFromEnv: () => null,
  createAgentRunStoreFromEnv: () => null,
  createRegistryStoreFromEnv: () => null,
  createThreadStoreFromEnv: () => null,
}));

function sleepGraph(id: string, durationMs: number) {
  return {
    graph: [
      {
        id: "prep",
        mapConfig: JSON.stringify({
          patch: { value: {} },
        }),
        type: "mapping",
      },
      { duration: durationMs, id: "nap", type: "sleep" },
      {
        id: "prep-write",
        mapConfig: JSON.stringify({
          patch: { value: { status: "chased" } },
        }),
        type: "mapping",
      },
      { id: "write", toolId: "apply_field_updates", type: "tool" },
    ],
    id,
    inputSchema: { properties: {}, type: "object" },
    outputSchema: { properties: {}, type: "object" },
  };
}

describeIfDb("a graph that sleeps", () => {
  it("parks, then completes on its own after a short sleep", async () => {
    const { startGraphRun } = await import("../dispatch.js");
    const graphId = randomUUID();
    const version = {
      workflow_id: graphId,
      allowed_tools: null,
      approved_at: new Date().toISOString(),
      approved_by_user_id: null,
      authored_by: "user" as const,
      created_at: new Date().toISOString(),
      created_by_user_id: null,
      graph: sleepGraph(`workflow:${graphId}`, 1500),
      id: randomUUID(),
      input_schema: {},
      output_schema: {},
      tenant_id: "tenant-a",
      version: 1,
    };

    const outcome = await startGraphRun({
      ctx: {
        workflowId: graphId,
        workflowVersion: 1,
        contextId: "offer-1",
        contextType: "offers.offer",
        requestId: randomUUID(),
        tenantId: "tenant-a",
        threadId: randomUUID(),
      },
      input: {},
      runId: randomUUID(),
      version,
    });

    // OBSERVED CONTRACT: `run.start()` awaits the sleep in-process and the run
    // finishes. That is fine for short waits, and it is why `startGraphRun` is
    // called without awaiting from the route.
    //
    // A long sleep is held by a live process, so a restart mid-sleep strands
    // it: nothing suspended, so there is no snapshot to resume and no
    // `wake_at` for the wake sweep to find. `wait_until` is the node that
    // writes both — the validator caps a raw sleep at 15 minutes to keep
    // authors on that side of the line.
    expect(outcome.status).toBe("success");
    expect(invoke).toHaveBeenCalledWith("offers_update", {
      id: "offer-1",
      patch: { status: "chased" },
    });
  });
});
