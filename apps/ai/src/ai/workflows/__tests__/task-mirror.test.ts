// The settle -> task mirror (Variant D, Phase 6 D3). This is the seam that
// closes the loop for runs that settle long after the task job returned: a gate
// answered tomorrow, a sleeper woken next week.
//
// Its fail-open contract is the point of most of these tests. The flow has
// already run and its effects are real; throwing here would fail a resume path
// and could roll back a completed run, so a broken board is the acceptable
// outcome and an exception never is.

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));
vi.mock("../../jobs/task-job-scope.js", () => ({
  resolveTaskJobServiceScope: async (tenantId: string) => ({ tenantId }),
}));

const { mirrorFlowDecisionToTask, mirrorFlowSettleToTask } = await import(
  "../task-mirror.js"
);

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";

function updateCall() {
  return invoke.mock.calls.find(([op]) => op === "tasks_update")?.[1];
}
function commentCall() {
  return invoke.mock.calls.find(([op]) => op === "tasks_add_comment")?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockResolvedValue({});
});

describe("flow settle -> task mirror", () => {
  it("closes the task when the flow completed", async () => {
    await mirrorFlowSettleToTask({
      detail: "3 receipts filed",
      kind: "completed",
      taskId: TASK_ID,
      tenantId: TENANT_ID,
    });

    expect(updateCall()).toEqual({ id: TASK_ID, status: "done" });
    expect(commentCall().content).toContain("3 receipts filed");
    // The op names the task `id`. It used to be called with `task_id` on an op
    // that did not exist, so no flow ever commented on its task.
    expect(commentCall().id).toBe(TASK_ID);
  });

  it("parks the task in review while a gate is unanswered", async () => {
    await mirrorFlowSettleToTask({
      detail: "Approve payment",
      kind: "gated",
      taskId: TASK_ID,
      tenantId: TENANT_ID,
    });

    expect(updateCall()).toEqual({ id: TASK_ID, status: "in_review" });
    expect(commentCall().content).toContain("Approve payment");
  });

  it("blocks the task when the flow failed", async () => {
    await mirrorFlowSettleToTask({
      detail: "tool refused",
      kind: "failed",
      taskId: TASK_ID,
      tenantId: TENANT_ID,
    });

    expect(updateCall()).toEqual({ id: TASK_ID, status: "blocked" });
    expect(commentCall().content).toContain("tool refused");
  });

  it("still moves the task when only the comment fails", async () => {
    invoke.mockImplementation(async (op: string) => {
      if (op === "tasks_add_comment") {
        throw new Error("comments unavailable");
      }
      return {};
    });

    await mirrorFlowSettleToTask({
      kind: "completed",
      taskId: TASK_ID,
      tenantId: TENANT_ID,
    });

    // The status is what the board reads; a lost comment must not cost it.
    expect(updateCall()).toEqual({ id: TASK_ID, status: "done" });
  });

  it("never throws when the task cannot be updated at all", async () => {
    invoke.mockRejectedValue(new Error("tasks module is gone"));

    await expect(
      mirrorFlowSettleToTask({
        kind: "completed",
        taskId: TASK_ID,
        tenantId: TENANT_ID,
      })
    ).resolves.toBeUndefined();
  });
});

// P8-1: the answer half of the durable channel. Both halves must be on the
// task thread in EVERY tier, so degrading a suspended run to the park path
// (snapshot gone, answer a week late) loses nothing.
describe("flow decision -> task comment", () => {
  it("records an approval with the question and who answered", async () => {
    await mirrorFlowDecisionToTask({
      answeredByUserId: "user-1",
      approved: true,
      question: "Mark 3 offers as sent?",
      taskId: TASK_ID,
      tenantId: TENANT_ID,
    });

    expect(commentCall()).toEqual({
      content: "✅ Approved: Mark 3 offers as sent?",
      id: TASK_ID,
      kind: "system",
      metadata: { answered_by_user_id: "user-1" },
    });
  });

  it("records a rejection with the reason the person typed", async () => {
    await mirrorFlowDecisionToTask({
      approved: false,
      question: "Send the reminder?",
      reason: "Customer already paid.",
      taskId: TASK_ID,
      tenantId: TENANT_ID,
    });

    expect(commentCall()?.content).toBe(
      "🚫 Rejected: Send the reminder?\n\nCustomer already paid."
    );
    // No user id known: the record still gets written, just unattributed.
    expect(commentCall()?.metadata).toBeUndefined();
  });

  it("never throws — the decision already reached the run", async () => {
    invoke.mockRejectedValue(new Error("tasks module is gone"));

    await expect(
      mirrorFlowDecisionToTask({
        approved: true,
        taskId: TASK_ID,
        tenantId: TENANT_ID,
      })
    ).resolves.toBeUndefined();
  });
});
