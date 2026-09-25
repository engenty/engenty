// A run that asked its human a question must PARK, not close. Two ways in:
// TASK_BLOCKED in the final text (comment + `task_needs_input` inbox), or
// `task_ask_user` (the tool already wrote the comment; inbox is `task_question`).
// The task ends `in_review` — waiting on a person, not on another task — so
// nothing dispatches it again on its own while it stays visible in the briefing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskJobEnvelope } from "../task-job-schema.js";

// Rest params, not `()`: `tsc` types a zero-arity mock's `calls` as `[]`,
// so `calls[0][1]` is a tuple-index error even though vitest is happy.
const invoke = vi.fn(async (..._args: unknown[]) => ({}));
const emitInboxNotification = vi.fn(async (..._args: unknown[]) => {});
const finishTaskJobRun = vi.fn(async (..._args: unknown[]) => {});
const summarizeTaskResultHeadline = vi.fn(async (..._args: unknown[]) => null);

function invokedPayload(operation: string): Record<string, unknown> {
  const payload = invoke.mock.calls.find((call) => call[0] === operation)?.[1];
  expect(payload).toEqual(expect.any(Object));
  return payload as Record<string, unknown>;
}

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
  resolveNotifications: vi.fn(async () => 0),
}));
vi.mock("../summarize-result-headline.js", () => ({
  summarizeApprovalRequest: async () => null,
  summarizeTaskResultHeadline: (...args: unknown[]) =>
    summarizeTaskResultHeadline(...args),
}));

import { finalizeStep, writeResultStep } from "../task-job-steps.js";

const RUN_ID = "44444444-4444-4444-8444-444444444444";

// An ordinary assigned task — not a routine. Before this, only a routine could
// signal "a human should look at this", and only an ungranted GATED TOOL could
// stop a task to ask for something.
const blocked = {
  agent_type_key: "time-tracking.tracker",
  blocked_question: "which project does Wednesday's 4h belong to",
  identifier: "ENG-12",
  result_text: "Logged Monday and Tuesday.",
  status: "needs_input" as const,
  task_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  title: "Log last week's hours",
};

const asked = {
  agent_type_key: "engenty.coordinator",
  identifier: "ENG-9",
  question: "Which of the two suppliers should I order from?",
  result_text: "I need a decision before I can order.",
  status: "needs_input" as const,
  task_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  title: "Order the parts",
};

beforeEach(() => {
  invoke.mockClear();
  invoke.mockResolvedValue({});
  emitInboxNotification.mockClear();
  finishTaskJobRun.mockClear();
});

function callsFor(op: string) {
  return invoke.mock.calls.filter(([called]) => called === op);
}

describe("a run that stopped to ask a human (TASK_BLOCKED)", () => {
  it("comments the question ahead of the partial work", async () => {
    const afterWrite = await runStep(writeResultStep, blocked, "run-1");

    expect(invoke).toHaveBeenCalledWith(
      "tasks_add_comment",
      expect.objectContaining({
        content: expect.stringContaining(
          "Needs your input — which project does Wednesday's 4h belong to"
        ),
      })
    );
    const comment = invokedPayload("tasks_add_comment").content;
    if (typeof comment !== "string") {
      throw new Error("comment content is not a string");
    }
    expect(comment).toContain("Logged Monday and Tuesday.");
    expect(comment.indexOf("Needs your input")).toBeLessThan(
      comment.indexOf("Logged Monday")
    );
    expect(afterWrite.status).toBe("needs_input");
  });

  it("parks the task in review and files the question in the inbox", async () => {
    await runStep(finalizeStep, blocked, "run-2");

    expect(invoke).toHaveBeenCalledWith(
      "tasks_release",
      expect.objectContaining({ outcome: "needs_input" })
    );
    expect(invoke).toHaveBeenCalledWith(
      "tasks_update",
      expect.objectContaining({ status: "in_review" })
    );
    // The title names the task; the question is the line under it — a row
    // reading only "Task ENG-12" makes the reader open it to find out what
    // is even being asked.
    expect(emitInboxNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "which project does Wednesday's 4h belong to",
        kind: "task_needs_input",
        priority: "high",
        title: expect.objectContaining({ key: "task_needs_input" }),
      })
    );
  });

  it("does not claim an approval is pending", async () => {
    await runStep(finalizeStep, blocked, "run-3");

    expect(
      invokedPayload("tasks_release").pending_approval_operation_ids
    ).toEqual([]);
  });
});

describe("a run that asked a question (`task_ask_user`)", () => {
  it("does not post a second comment — the question already is one", async () => {
    await runStep(writeResultStep, asked, RUN_ID);
    expect(callsFor("tasks_add_comment")).toHaveLength(0);
  });

  it("parks the task in review so nothing re-dispatches it by itself", async () => {
    await runStep(finalizeStep, asked, RUN_ID);

    const release = callsFor("tasks_release")[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(release.outcome).toBe("needs_input");
    // Released to an entry status first; the status update below is what parks
    // it. Release order is load-bearing — see the finalize step's comment.
    expect(release.resting_status).toBe("todo");

    // Not an entry status, so no checkout claims it; and unlike `blocked` it
    // still appears on the briefing, which is where the answer comes from.
    const update = callsFor("tasks_update")[0]?.[1] as Record<string, unknown>;
    expect(update.status).toBe("in_review");
  });

  it("counts as a completed run, not a failure", async () => {
    await runStep(finalizeStep, asked, RUN_ID);
    expect(finishTaskJobRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" })
    );
  });

  it("raises the question in the inbox with the question as its line", async () => {
    await runStep(finalizeStep, asked, RUN_ID);

    expect(emitInboxNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: asked.question,
        kind: "task_question",
        priority: "high",
        title: { key: "task_question", params: { task: asked.title } },
      })
    );
  });

  it("asks even when the run otherwise had nothing to report", async () => {
    // A question outranks every quieter lane — nobody would ever see it
    // otherwise.
    await runStep(finalizeStep, { ...asked, result_text: "" }, RUN_ID);

    const update = callsFor("tasks_update")[0]?.[1] as Record<string, unknown>;
    expect(update.status).toBe("in_review");
    expect(emitInboxNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "task_question" })
    );
  });
});
