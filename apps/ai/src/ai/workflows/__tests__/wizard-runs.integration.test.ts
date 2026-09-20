// A wizard end to end against the real pg snapshot store: a surface gate at
// the top, a review gate inside a loop whose body is an inline workflow,
// resume by path, the loop repeating, a step back (time travel) and a cancel.
//
// Skipped when SUPABASE_DB_URL is unset (CI without a database) rather than
// failing, so the suite stays runnable everywhere.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const DB_URL = process.env.SUPABASE_DB_URL?.trim();
const describeIfDb = DB_URL ? describe : describe.skip;

const setStatus = vi.fn(async () => undefined);
vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => () => ({ ok: true }),
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

const askPage = {
  components: [
    {
      children: ["customer", "go"],
      component: "Form",
      id: "root",
      submit: { event: { name: "next" } },
    },
    {
      component: "TextField",
      id: "customer",
      label: "Kunde",
      required: true,
      value: { path: "/customer" },
    },
    {
      action: { event: { name: "next" } },
      component: "Button",
      id: "go",
      label: "Weiter",
    },
  ],
  data: { customer: "" },
};

const reviewPage = {
  components: [
    { children: ["notes", "ok", "again"], component: "Column", id: "root" },
    {
      component: "TextArea",
      id: "notes",
      label: "Änderungswünsche",
      value: { path: "/notes" },
    },
    {
      action: { event: { name: "ok" } },
      component: "Button",
      id: "ok",
      label: "Passt",
    },
    {
      action: { event: { name: "revise" } },
      component: "Button",
      id: "again",
      label: "Nochmal",
    },
  ],
  data: { notes: "" },
};

function gate(
  id: string,
  title: string,
  payload: unknown,
  acceptsText = false
) {
  return [
    {
      id: `prep-${id}`,
      mapConfig: JSON.stringify({
        accepts_text: { value: acceptsText },
        kind: { value: "surface" },
        payload: { value: payload },
        title: { value: title },
      }),
      type: "mapping",
    },
    { id, toolId: "approval_gate", type: "tool" },
  ];
}

function buildWizardGraph(id: string) {
  return {
    id,
    inputSchema: { properties: {}, type: "object" },
    outputSchema: { properties: {}, type: "object" },
    graph: [
      ...gate("ask", "Für wen?", askPage),
      {
        loopType: "dountil",
        predicate: {
          left: { path: "stepResults.draftLoop.event" },
          op: "eq",
          right: { literal: "ok" },
        },
        step: {
          graph: gate("review", "Passt der Entwurf?", reviewPage, true),
          id: "draftLoop",
          type: "workflow",
        },
        type: "loop",
      },
    ],
  };
}

function versionFor(graphId: string) {
  return {
    workflow_id: graphId,
    allowed_tools: null,
    approved_at: new Date().toISOString(),
    approved_by_user_id: null,
    authored_by: "user" as const,
    created_at: new Date().toISOString(),
    created_by_user_id: null,
    graph: buildWizardGraph(`workflow:${graphId}`),
    id: randomUUID(),
    input_schema: {},
    output_schema: {},
    tenant_id: "tenant-a",
    version: 1,
  };
}

describeIfDb("wizard runs (integration)", () => {
  it("walks page → loop page (by path) → back → forward → cancel", async () => {
    const {
      cancelGraphRun,
      readGraphRunSnapshot,
      resumeGraphRun,
      startGraphRun,
      timeTravelGraphRun,
    } = await import("../dispatch.js");
    const { validateGraphAction } = await import("../validate-graph.js");

    const graphId = randomUUID();
    const version = versionFor(graphId);
    expect(
      validateGraphAction(version.graph as never, { surface: "wizard" })
    ).toEqual([]);

    const ctx = {
      workflowId: graphId,
      workflowVersion: 1,
      requestId: randomUUID(),
      tenantId: "tenant-a",
      threadId: randomUUID(),
    };
    const runId = randomUUID();

    // Page 1: the top-level surface gate, with the page in the envelope.
    const started = await startGraphRun({ ctx, input: {}, runId, version });
    expect(started.status).toBe("suspended");
    expect(started.gate?.path).toEqual(["ask"]);
    expect(started.gate?.stepId).toBe("ask");
    expect(started.gate?.surface.components.map((c) => c.id)).toContain(
      "customer"
    );
    expect(started.gate?.accepts_text).toBe(false);

    // Page 2: the review gate inside the loop body, addressed by path.
    const afterAsk = await resumeGraphRun({
      ctx,
      resumeData: { approved: true, data: { customer: "Acme" }, event: "next" },
      runId,
      stepId: started.gate?.path,
      version,
    });
    expect(afterAsk.status).toBe("suspended");
    expect(afterAsk.gate?.path).toEqual(["draftLoop", "review"]);
    expect(afterAsk.gate?.stepId).toBe("review");
    expect(afterAsk.gate?.accepts_text).toBe(true);

    // The snapshot after a restart says the same, and remembers page 1.
    const snapshot = await readGraphRunSnapshot({ runId, version });
    expect(snapshot?.gate?.path).toEqual(["draftLoop", "review"]);
    expect(snapshot?.answers.ask).toMatchObject({ data: { customer: "Acme" } });
    expect(snapshot?.nodes.review?.state).toBe("waiting-approval");

    // "Nochmal" loops: the same page asks again.
    const again = await resumeGraphRun({
      ctx,
      resumeData: {
        approved: true,
        data: { notes: "kürzer" },
        event: "revise",
      },
      runId,
      stepId: afterAsk.gate?.path,
      version,
    });
    expect(again.status).toBe("suspended");
    expect(again.gate?.path).toEqual(["draftLoop", "review"]);

    // Back to page 1: the gate asks again and its earlier answer is kept.
    const back = await timeTravelGraphRun({
      ctx,
      runId,
      stepId: "ask",
      version,
    });
    expect(back.status).toBe("suspended");
    expect(back.gate?.path).toEqual(["ask"]);
    const afterBack = await readGraphRunSnapshot({ runId, version });
    expect(afterBack?.answers.ask).toMatchObject({
      data: { customer: "Acme" },
    });
    expect(afterBack?.nodes.draftLoop).toBeUndefined();

    // Forward again, then "Passt" finishes the loop and the run.
    const forward = await resumeGraphRun({
      ctx,
      resumeData: {
        approved: true,
        data: { customer: "Acme GmbH" },
        event: "next",
      },
      runId,
      stepId: "ask",
      version,
    });
    expect(forward.gate?.path).toEqual(["draftLoop", "review"]);
    const done = await resumeGraphRun({
      ctx,
      resumeData: { approved: true, data: { notes: "" }, event: "ok" },
      runId,
      stepId: forward.gate?.path,
      version,
    });
    expect(done.status).toBe("success");
    expect(done.result).toMatchObject({ approved: true, event: "ok" });
  });

  it("cancel leaves the run cancelled in the snapshot", async () => {
    const { cancelGraphRun, readGraphRunSnapshot, startGraphRun } =
      await import("../dispatch.js");
    const graphId = randomUUID();
    const version = versionFor(graphId);
    const ctx = {
      workflowId: graphId,
      workflowVersion: 1,
      requestId: randomUUID(),
      tenantId: "tenant-a",
      threadId: randomUUID(),
    };
    const runId = randomUUID();
    const started = await startGraphRun({ ctx, input: {}, runId, version });
    expect(started.status).toBe("suspended");
    await cancelGraphRun({ runId, version });
    const snapshot = await readGraphRunSnapshot({ runId, version });
    expect(snapshot?.status).toBe("canceled");
  });
});
