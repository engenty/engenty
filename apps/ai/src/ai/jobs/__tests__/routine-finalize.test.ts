import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async () => ({}));
const emitInboxNotification = vi.fn(async () => {});
const finishTaskJobRun = vi.fn(async () => {});
const summarizeTaskResultHeadline = vi.fn(async () => null);

vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));
vi.mock("../task-job-scope.js", () => ({
  resolveTaskJobServiceScope: async () => ({ tenantId: "tenant" }),
}));
vi.mock("../task-job-run-record.js", () => ({
  finishTaskJobRun: (...args: unknown[]) => finishTaskJobRun(...args),
  registerTaskJobRun: vi.fn(),
}));
vi.mock("../../../notifications/inbox.js", () => ({
  emitInboxNotification: (...args: unknown[]) => emitInboxNotification(...args),
}));
vi.mock("../summarize-result-headline.js", () => ({
  summarizeTaskResultHeadline: (...args: unknown[]) =>
    summarizeTaskResultHeadline(...args),
}));

import { finalizeStep, writeResultStep } from "../task-job-steps.js";

const base = {
  agent_type_key: "engenty.coordinator",
  identifier: "ENG-1",
  result_text: "ROUTINE_OK",
  status: "ran" as const,
  task_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  title: "Coordinator heartbeat",
  trigger_id: "33333333-3333-4333-8333-333333333333",
};

beforeEach(() => {
  invoke.mockClear();
  invoke.mockResolvedValue({});
  emitInboxNotification.mockClear();
  finishTaskJobRun.mockClear();
});

describe("routine finalize disposition", () => {
  it("quiet: no comment, completed_quiet outcome, backlog, no notification", async () => {
    const afterWrite = await writeResultStep.execute({
      inputData: base,
      runId: "run-1",
    } as never);
    expect(invoke).not.toHaveBeenCalledWith(
      "tasks_add_comment",
      expect.anything()
    );
    expect(afterWrite.run_disposition).toBe("quiet");

    await finalizeStep.execute({
      inputData: afterWrite,
      runId: "run-1",
    } as never);

    expect(invoke).toHaveBeenCalledWith(
      "tasks_release",
      expect.objectContaining({
        outcome: "completed_quiet",
        resting_status: "backlog",
      })
    );
    expect(invoke).toHaveBeenCalledWith(
      "tasks_update",
      expect.objectContaining({ status: "backlog" })
    );
    expect(emitInboxNotification).not.toHaveBeenCalled();
  });

  it("review: comment + in_review + notification", async () => {
    const afterWrite = await writeResultStep.execute({
      inputData: {
        ...base,
        result_text: "Something odd.\nROUTINE_REVIEW: check ENG-9",
      },
      runId: "run-2",
    } as never);
    expect(invoke).toHaveBeenCalledWith(
      "tasks_add_comment",
      expect.objectContaining({
        content: expect.stringContaining("Something odd"),
      })
    );
    expect(afterWrite.run_disposition).toBe("review");

    await finalizeStep.execute({
      inputData: afterWrite,
      runId: "run-2",
    } as never);

    expect(invoke).toHaveBeenCalledWith(
      "tasks_update",
      expect.objectContaining({ status: "in_review" })
    );
    expect(emitInboxNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "task_review_requested",
        priority: "high",
      })
    );
  });
});
