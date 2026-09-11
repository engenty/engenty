// The whole loop, against real Postgres: an LLM-shaped graph is proposed,
// validated, saved unapproved, published by a human, run, gated, and resumed.
//
// This is the test that would catch a regression anywhere in the chain the user
// actually walks — the pieces are unit-tested separately, but only this proves
// they compose.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const DB_URL = process.env.SUPABASE_DB_URL?.trim();
const describeIfDb = DB_URL ? describe : describe.skip;

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

const mapping = (id: string, config: Record<string, unknown>) => ({
  id,
  mapConfig: JSON.stringify(config),
  type: "mapping",
});

/** The shape `workflow_propose` asks the model to emit. */
const proposedGraph = [
  mapping("prep-gate", {
    kind: { value: "field_updates" },
    payload: { value: { status: "sent" } },
    title: { value: "Mark the offer as sent?" },
  }),
  { id: "gate", toolId: "approval_gate", type: "tool" },
  mapping("prep-apply", { patch: { step: "gate", path: "data" } }),
  { id: "apply", toolId: "apply_field_updates", type: "tool" },
];

describeIfDb("propose → publish → run → approve", () => {
  let tenantId = "";
  let graphId = "";

  beforeAll(async () => {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    const tenants = await client.query("select id from core.tenants limit 1");
    tenantId = tenants.rows[0]?.id ?? "";
    await client.end();
    expect(tenantId).toBeTruthy();
  });

  afterAll(async () => {
    if (!graphId) {
      return;
    }
    const { Client } = await import("pg");
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    // Runs pin versions via ON DELETE RESTRICT, so clear the audit rows first —
    // which is itself a check that the guard is wired the way we think.
    await client.query(
      "delete from ai.workflow_run where workflow_version_id in (select id from ai.workflow_version where workflow_id = $1)",
      [graphId]
    );
    await client.query("delete from ai.workflow where id = $1", [graphId]);
    await client.end();
  });

  it("saves unapproved, refuses to run, then runs once published", async () => {
    const { createWorkflowStoreFromEnv } = await import("../../index.js");
    const { validateGraphAction } = await import("../validate-graph.js");
    const store = createWorkflowStoreFromEnv();
    expect(store).toBeTruthy();
    if (!store) {
      return;
    }

    const stored = {
      description: "Mark an offer sent, with approval.",
      graph: proposedGraph,
      id: "workflow:pending",
      inputSchema: { properties: {}, type: "object" },
      outputSchema: { properties: {}, type: "object" },
    };

    // 1. The graph the model produced validates.
    expect(validateGraphAction(stored)).toEqual([]);

    // 2. Propose: definition + unapproved version.
    const graph = await store.create({
      contextType: "offers.offer",
      description: stored.description,
      name: `IT flow ${randomUUID().slice(0, 8)}`,
      tenantId,
    });
    graphId = graph.id;
    const version = await store.saveVersion({
      workflowId: graphId,
      authoredBy: "copilot",
      graph: { ...stored, id: `workflow:${graphId}` },
      tenantId,
    });
    expect(version.version).toBe(1);
    expect(version.approved_at).toBeNull();

    // 3. Unapproved ⇒ not dispatchable. This is the governance gate: a saved
    // version is inert until a human publishes it.
    expect(await store.getCurrent({ id: graphId, tenantId })).toBeNull();

    // 4. Publish.
    const published = await store.publishVersion({
      approvedByUserId: null,
      tenantId,
      versionId: version.id,
    });
    expect(published.graph.status).toBe("active");
    expect(published.version.approved_at).toBeTruthy();

    const current = await store.getCurrent({ id: graphId, tenantId });
    expect(current?.version.id).toBe(version.id);

    // 5. Run it — the gate suspends before anything is written.
    const { resumeGraphRun, startGraphRun } = await import("../dispatch.js");
    const runId = randomUUID();
    const runCtx = {
      workflowId: graphId,
      workflowVersion: 1,
      contextId: "offer-77",
      contextType: "offers.offer",
      requestId: randomUUID(),
      tenantId,
      threadId: randomUUID(),
    };
    const started = await startGraphRun({
      ctx: runCtx,
      input: {},
      runId,
      version: current?.version as never,
    });
    expect(started.status).toBe("suspended");
    expect(started.gate?.title).toBe("Mark the offer as sent?");
    expect(invoke).not.toHaveBeenCalled();

    // 6. Approve — and only now does the write happen.
    const resumed = await resumeGraphRun({
      ctx: runCtx,
      resumeData: { approved: true, data: { status: "sent" } },
      runId,
      stepId: "gate",
      version: current?.version as never,
    });
    expect(resumed.status).toBe("success");
    expect(invoke).toHaveBeenCalledWith("offers_update", {
      id: "offer-77",
      patch: { status: "sent" },
    });
    void setStatus;
  });

  it("mints a second immutable version rather than editing the first", async () => {
    const { createWorkflowStoreFromEnv } = await import("../../index.js");
    const store = createWorkflowStoreFromEnv();
    if (!(store && graphId)) {
      return;
    }
    const v2 = await store.saveVersion({
      workflowId: graphId,
      graph: {
        description: "changed",
        graph: proposedGraph,
        id: `workflow:${graphId}`,
        inputSchema: {},
        outputSchema: {},
      },
      tenantId,
    });
    expect(v2.version).toBe(2);

    const versions = await store.listVersions({
      workflowId: graphId,
      tenantId,
    });
    expect(versions).toHaveLength(2);
    // v1 is untouched — a run pinned to it still sees exactly what it started
    // on, which is the whole point of immutable versions.
    const v1 = versions.find((entry) => entry.version === 1);
    expect(v1?.approved_at).toBeTruthy();
    expect((v1?.graph as { description?: string }).description).toBe(
      "Mark an offer sent, with approval."
    );
    // ...and the published pointer has NOT moved to the unapproved v2.
    const current = await store.getCurrent({ id: graphId, tenantId });
    expect(current?.version.version).toBe(1);
  });
});
