import { beforeEach, describe, expect, it, vi } from "vitest";

const { current, invokePublishedActionInTask, startPublishedWorkflowRun } =
  vi.hoisted(() => ({
    current: {
      graph: {
        description: "Deterministic work",
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
    },
    invokePublishedActionInTask: vi.fn(),
    startPublishedWorkflowRun: vi.fn(),
  }));

vi.mock("../../ai/tools/invoke-workflow-execution.js", () => ({
  invokePublishedActionInTask,
  startPublishedWorkflowRun,
}));
vi.mock("../ai/index.js", () => ({
  createRoutineStoreFromEnv: () => ({
    list: async () => [
      {
        enabled: true,
        id: "routine-open",
        workflow_id: "00000000-0000-4000-8000-000000000111",
      },
    ],
  }),
  createRoutineTriggerStoreFromEnv: () => ({
    list: async () => [
      { enabled: true, kind: "agent", routine_id: "routine-open" },
    ],
  }),
  createWorkflowStoreFromEnv: () => ({
    getCurrent: vi.fn(async () => current),
  }),
}));

import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { invokeActionTool } from "../../ai/tools/invoke-workflow-tool.js";

const ACTION_ID = "00000000-0000-4000-8000-000000000111";
// `workflow_id` matches the tool's input schema exactly.
// The field name here MUST track the schema exactly: Mastra validates tool
// input, so a wrong key doesn't throw — execute returns a validation-error
// object and the mocks record zero calls, which reads as a mystery.
const INPUT = { workflow_id: ACTION_ID, input: { id: "contact-1" } };

async function execute(context: Record<string, unknown>) {
  return engentyToolsRunAls.run(context, () =>
    (
      invokeActionTool as unknown as {
        execute: (input: typeof INPUT, context: unknown) => Promise<unknown>;
      }
    ).execute(INPUT, { agent: { toolCallId: "call-7" } })
  );
}

beforeEach(() => {
  invokePublishedActionInTask.mockReset();
  startPublishedWorkflowRun.mockReset();
});

describe("invoke_workflow durable task binding", () => {
  it("dispatches a subject-bound run — no Task — outside an existing Task", async () => {
    startPublishedWorkflowRun.mockResolvedValue({
      run_id: "run-out-1",
      status: "queued",
    });
    await execute({
      runId: "run-1",
      space: {
        allConnectorPrefixes: new Set(),
        connectorPrefixes: new Set(),
        moduleIds: new Set(["contacts"]),
        readOnlyModuleIds: new Set(),
        spaceId: "00000000-0000-4000-8000-000000000200",
      },
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(startPublishedWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        invocationKey: "invoke-action:run-1:call-7",
      })
    );
    // The run-only path carries no space keying — that belonged to the retired
    // manual-trigger provisioning.
    expect(startPublishedWorkflowRun.mock.calls[0]?.[0]).not.toHaveProperty(
      "spaceId"
    );
    expect(invokePublishedActionInTask).not.toHaveBeenCalled();
  });

  it("binds to the current Task and reuses the same retry key", async () => {
    invokePublishedActionInTask.mockResolvedValue({
      run_id: "flow-run-1",
      status: "completed",
      task_id: "task-existing",
    });
    const context = {
      orchestratorThreadId: "thread-1",
      runId: "run-2",
      taskId: "task-existing",
      tenantId: "tenant-1",
    };
    await execute(context);
    await execute(context);

    expect(invokePublishedActionInTask).toHaveBeenCalledTimes(2);
    expect(invokePublishedActionInTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        invocationKey: "invoke-action:run-2:call-7",
        taskId: "task-existing",
      })
    );
    expect(invokePublishedActionInTask.mock.calls[1]?.[0].invocationKey).toBe(
      invokePublishedActionInTask.mock.calls[0]?.[0].invocationKey
    );
    expect(startPublishedWorkflowRun).not.toHaveBeenCalled();
  });
});
