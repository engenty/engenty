import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskJobEnvelope } from "../task-job-schema.js";

const invoke = vi.fn(async () => ({}));
const emitInboxNotification = vi.fn(async (..._args: unknown[]) => {});
const finishTaskJobRun = vi.fn(async (..._args: unknown[]) => {});
const summarizeTaskResultHeadline = vi.fn(async (..._args: unknown[]) => null);

async function runStep(
  step: { execute: (params: never) => Promise<unknown> },
  inputData: Record<string, unknown>,
  runId: string
): Promise<TaskJobEnvelope> {
  return (await step.execute({ inputData, runId } as never)) as TaskJobEnvelope;
}

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
  summarizeApprovalRequest: async () => null,
  summarizeTaskResultHeadline: (...args: unknown[]) =>
    summarizeTaskResultHeadline(...args),
}));

import { finalizeStep, writeResultStep } from "../task-job-steps.js";

// An ordinary assigned task — not a routine. Before this, only a routine could
// signal "a human should look at this", and only an ungranted GATED TOOL could
// stop a task to ask for something.
const base = {
  agent_type_key: "time-tracking.tracker",
  blocked_question: "which project does Wednesday's 4h belong to",
  identifier: "ENG-12",
  result_text: "Logged Monday and Tuesday.",
  status: "needs_input" as const,
  task_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  title: "Log last week's hours",
};

beforeEach(() => {
  invoke.mockClear();
  invoke.mockResolvedValue({});
  emitInboxNotification.mockClear();
  finishTaskJobRun.mockClear();
});

describe("a run that stopped to ask a human", () => {
  it("comments the question ahead of the partial work", async () => {
    const afterWrite = await runStep(writeResultStep, base, "run-1");

    expect(invoke).toHaveBeenCalledWith(
      "tasks_add_comment",
      expect.objectContaining({
        content: expect.stringContaining(
          "Needs your input — which project does Wednesday's 4h belong to"
        ),
      })
    );
    const comment = invoke.mock.calls.find(
      (call) => call[0] === "tasks_add_comment"
    )?.[1] as { content: string };
    expect(comment.content).toContain("Logged Monday and Tuesday.");
    expect(comment.content.indexOf("Needs your input")).toBeLessThan(
      comment.content.indexOf("Logged Monday")
    );
    expect(afterWrite.status).toBe("needs_input");
  });

  it("blocks the task and files the question in the inbox", async () => {
    await runStep(finalizeStep, base, "run-2");

    expect(invoke).toHaveBeenCalledWith(
      "tasks_release",
      expect.objectContaining({ outcome: "needs_input" })
    );
    expect(invoke).toHaveBeenCalledWith(
      "tasks_update",
      expect.objectContaining({ status: "blocked" })
    );
    // The question is the inbox subject — a row reading only "Task ENG-12"
    // makes the reader open it to find out what is even being asked.
    expect(emitInboxNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "task_needs_input",
        priority: "high",
        summary: "which project does Wednesday's 4h belong to",
      })
    );
  });

  it("does not claim an approval is pending", async () => {
    await runStep(finalizeStep, base, "run-3");

    const release = invoke.mock.calls.find(
      (call) => call[0] === "tasks_release"
    )?.[1] as { pending_approval_operation_ids: string[] };
    expect(release.pending_approval_operation_ids).toEqual([]);
  });
});
