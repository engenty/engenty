import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRequest,
  dispatchPublishedWorkflowRun,
  getByRunId,
  settleGraphRun,
  startGraphRun,
} = vi.hoisted(() => ({
  createRequest: vi.fn(),
  dispatchPublishedWorkflowRun: vi.fn(),
  getByRunId: vi.fn(),
  settleGraphRun: vi.fn(),
  startGraphRun: vi.fn(),
}));

vi.mock("../ai/workflows/dispatch.js", () => ({ startGraphRun }));
vi.mock("../ai/workflows/dispatch-published-run.js", async () => {
  const actual = await vi.importActual<
    typeof import("../ai/workflows/dispatch-published-run.js")
  >("../ai/workflows/dispatch-published-run.js");
  return { dispatchPublishedWorkflowRun, stableUuid: actual.stableUuid };
});
vi.mock("../ai/workflows/run-lifecycle.js", () => ({ settleGraphRun }));
vi.mock("../ai/index.js", () => ({
  createWorkflowRunStoreFromEnv: () => ({
    create: createRequest,
    getByRunId,
  }),
}));

import {
  invokePublishedActionInTask,
  startPublishedWorkflowRun,
} from "../../ai/tools/invoke-workflow-execution.js";
import { FlowInputMissingError } from "../ai/workflows/flow-input.js";

const current = {
  graph: {
    description: "Research",
    id: "00000000-0000-4000-8000-000000000111",
    module_id: "contacts",
    name: "Research contact",
    status: "active",
  },
  version: {
    allowed_tools: [],
    id: "00000000-0000-4000-8000-000000000112",
    version: 1,
  },
} as never;

beforeEach(() => {
  createRequest.mockReset();
  dispatchPublishedWorkflowRun.mockReset();
  getByRunId.mockReset();
  settleGraphRun.mockReset();
  startGraphRun.mockReset();
});

describe("invoke action execution", () => {
  it("binds the action audit row to the current Task", async () => {
    getByRunId.mockResolvedValue(null);
    startGraphRun.mockResolvedValue({
      result: { ok: true },
      status: "success",
    });
    await invokePublishedActionInTask({
      current,
      flowInput: { contact: "contact-1" },
      invocationKey: "invoke-action:run-1:call-1",
      taskId: "task-1",
      tenantId: "tenant-1",
      threadId: "thread-1",
    });

    expect(createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerTaskId: "task-1",
        ownerTaskMode: "nested",
      })
    );
  });

  it("does not start a second graph run on an idempotent retry", async () => {
    getByRunId.mockResolvedValue({
      reason: null,
      status: "completed",
    });
    const result = await invokePublishedActionInTask({
      current,
      flowInput: {},
      invocationKey: "invoke-action:run-1:call-1",
      taskId: "task-1",
      tenantId: "tenant-1",
    });

    expect(result).toMatchObject({ status: "completed", task_id: "task-1" });
    expect(createRequest).not.toHaveBeenCalled();
    expect(startGraphRun).not.toHaveBeenCalled();
  });

  it("dispatches an outside invocation under its invocation key, so a retry dedupes", async () => {
    dispatchPublishedWorkflowRun.mockResolvedValue({
      deduped: false,
      requestId: "req-2",
      runId: "run-2",
      threadId: "thread-2",
    });
    await startPublishedWorkflowRun({
      current,
      flowInput: {},
      invocationKey: "invoke-action:run-2:call-4",
      scope: { tenantId: "tenant-1", userId: "user-1" },
    });

    expect(dispatchPublishedWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "invoke-action:run-2:call-4" })
    );
  });

  it("answers a call missing required input as failed, not queued", async () => {
    dispatchPublishedWorkflowRun.mockRejectedValue(
      new FlowInputMissingError(["connection_id"])
    );
    const result = await startPublishedWorkflowRun({
      current,
      flowInput: {},
      invocationKey: "invoke-action:run-4:call-1",
      scope: { tenantId: "tenant-1", userId: "user-1" },
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("connection_id");
    expect(result.run_id).toBeUndefined();
  });
});
