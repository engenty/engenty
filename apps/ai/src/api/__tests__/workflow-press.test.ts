// The press contract: a press is a RUN, never a task.
//
// History, because this is the regression the file exists to prevent: on
// 17 Aug the press converged onto trigger → task, when every fire still
// minted a fresh task — per-press isolation held. On 23 Aug routines became
// standing tasks, fires started WAKING one task instead of creating one, and
// the press silently inherited standing-task semantics: every press of one
// action shared one work record, the subject was dropped (manual fires never
// read `contexts`), and a second press was skipped while the first ran. No
// test covered a manual fire with two subjects, so nothing went red.
//
// The contract asserted here: a press dispatches a subject-bound graph run
// with NO owner task — `ai.workflow_run.owner_task_id` is null for
// button-started runs by documented design — and two subjects are two
// concurrent runs.
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dispatchPublishedWorkflowRun,
  findBySourceWorkflow,
  getCurrent,
  materializeManualFlowTask,
  startTaskJob,
} = vi.hoisted(() => ({
  dispatchPublishedWorkflowRun: vi.fn(
    async (input: { context: { contextId: string | null } }) => ({
      deduped: false,
      requestId: `req-${input.context.contextId ?? "none"}`,
      runId: `run-${input.context.contextId ?? "none"}`,
      threadId: `thread-${input.context.contextId ?? "none"}`,
    })
  ),
  // The press READS the published flow the reconcile materialized — it never
  // ensures or compiles anything itself.
  findBySourceWorkflow: vi.fn(async () => ({
    current_version: 3,
    id: "graph-1",
    status: "active",
  })),
  getCurrent: vi.fn(async () => ({
    graph: {
      description: "Enhance a contact",
      id: "graph-1",
      module_id: "contacts",
      name: "Enhance contact",
      status: "active",
    },
    version: { id: "version-1", version: 3 },
  })),
  materializeManualFlowTask: vi.fn(async () => {
    throw new Error(
      "a press must not touch the trigger/task machinery — this path is retired"
    );
  }),
  startTaskJob: vi.fn(async () => {
    throw new Error("a press must not start a task job");
  }),
}));

vi.mock("../../ai/workflows/dispatch-published-run.js", () => ({
  dispatchPublishedWorkflowRun,
}));
vi.mock("../manual-flow-task.js", () => ({ materializeManualFlowTask }));
vi.mock("../task-background-dispatch.js", () => ({ startTaskJob }));
const routineEnabled = vi.hoisted(() => ({ value: true }));

vi.mock("../../ai/index.js", () => ({
  createRoutineStoreFromEnv: () => ({
    list: async () => [
      {
        enabled: routineEnabled.value,
        id: "routine-open",
        // Gate keys on the published graph id (`current.graph.id`), not the
        // module action id.
        workflow_id: "graph-1",
      },
    ],
  }),
  createRoutineTriggerStoreFromEnv: () => ({
    list: async () => [
      { enabled: true, kind: "manual", routine_id: "routine-open" },
    ],
  }),
  createWorkflowStoreFromEnv: () =>
    ({ findBySourceWorkflow, getCurrent }) as never,
}));

import { pressWorkflow, WorkflowPressRefusedError } from "../workflow-press.js";

const ACTION = {
  definition: {
    graph: [{ id: "run", toolId: "run_specialist", type: "tool" }],
    id: "contacts.enhance-contact",
    inputSchema: { type: "object" },
    outputSchema: {},
  },
  description: "Enhance a contact",
  id: "contacts.enhance-contact",
  module_id: "contacts",
  name: "Enhance contact",
  owner_agent_id: "contacts.researcher",
} as never;

const SCOPE = { tenantId: "tenant-1", userId: "user-1" } as never;

function press(contextId: string, input: Record<string, unknown>) {
  return pressWorkflow({
    action: ACTION,
    context: { contextId, contextType: "contacts.person" },
    input,
    mastra: {} as never,
    scope: SCOPE,
  });
}

describe("pressWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routineEnabled.value = true;
  });

  it("refuses a paused routine with a typed reason, never an internal error", async () => {
    routineEnabled.value = false;

    const refused = await press("contact-a", { id: "contact-a" }).catch(
      (err: unknown) => err
    );

    expect(refused).toBeInstanceOf(WorkflowPressRefusedError);
    expect(refused).toMatchObject({
      code: "workflow_not_pressable",
      reason: "Its routine is paused.",
    });
    expect(dispatchPublishedWorkflowRun).not.toHaveBeenCalled();
  });

  it("dispatches a subject-bound run and creates neither trigger nor task", async () => {
    const result = await press("contact-a", { id: "contact-a" });

    expect(materializeManualFlowTask).not.toHaveBeenCalled();
    expect(startTaskJob).not.toHaveBeenCalled();
    expect(dispatchPublishedWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { contextId: "contact-a", contextType: "contacts.person" },
        input: { id: "contact-a" },
        trigger: "button",
      })
    );
    expect(result.runId).toBe("run-contact-a");
    // The old contract leaked a task id to every caller; the new one has none.
    expect("taskId" in result).toBe(false);
  });

  it("runs two subjects concurrently — two presses, two runs", async () => {
    const [a, b] = await Promise.all([
      press("contact-a", { id: "contact-a" }),
      press("contact-b", { id: "contact-b" }),
    ]);

    expect(a.runId).toBe("run-contact-a");
    expect(b.runId).toBe("run-contact-b");
    expect(dispatchPublishedWorkflowRun).toHaveBeenCalledTimes(2);
  });

  it("surfaces the dispatcher's per-subject dedup instead of skipping silently", async () => {
    dispatchPublishedWorkflowRun.mockResolvedValueOnce({
      deduped: true,
      requestId: "req-existing",
      runId: "run-existing",
      threadId: "thread-existing",
    });

    const result = await press("contact-a", { id: "contact-a" });
    expect(result.deduped).toBe(true);
    expect(result.runId).toBe("run-existing");
  });
});
