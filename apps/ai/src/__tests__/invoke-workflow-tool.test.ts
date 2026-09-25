import { describe, expect, it, vi } from "vitest";

const { runRows, startGraphRun } = vi.hoisted(() => ({
  runRows: new Map<string, { reason: null; status: string }>(),
  startGraphRun: vi.fn(async () => ({
    result: { ok: true },
    status: "success",
  })),
}));

vi.mock("../ai/workflows/dispatch.js", () => ({ startGraphRun }));
vi.mock("../ai/workflows/run-lifecycle.js", () => ({
  settleGraphRun: vi.fn(async () => {}),
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
  createWorkflowRunStoreFromEnv: () => ({
    create: async (row: { runId: string }) => {
      runRows.set(row.runId, { reason: null, status: "completed" });
    },
    getByRunId: async ({ runId }: { runId: string }) =>
      runRows.get(runId) ?? null,
  }),
  createWorkflowStoreFromEnv: () => ({
    getCurrent: async () => ({
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
    }),
  }),
}));

import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { invokeActionTool } from "../../ai/tools/invoke-workflow-tool.js";

// Must match the tool's input schema: Mastra answers a wrong key with a
// validation-error object instead of throwing.
const INPUT = {
  workflow_id: "00000000-0000-4000-8000-000000000111",
  input: { id: "contact-1" },
};

function execute(context: Record<string, unknown>) {
  return engentyToolsRunAls.run(context, () =>
    (
      invokeActionTool as unknown as {
        execute: (
          input: typeof INPUT,
          context: unknown
        ) => Promise<{ run_id?: string }>;
      }
    ).execute(INPUT, { agent: { toolCallId: "call-7" } })
  );
}

describe("invoke_workflow", () => {
  it("starts one graph run when the same in-task tool call is retried", async () => {
    const context = {
      orchestratorThreadId: "thread-1",
      runId: "run-2",
      taskId: "task-existing",
      tenantId: "tenant-1",
    };
    const first = await execute(context);
    const retry = await execute(context);

    expect(startGraphRun).toHaveBeenCalledTimes(1);
    expect(retry.run_id).toBe(first.run_id);
  });
});
