// The thread a task job runs on is the ACTOR's standing thread for that task,
// not the run's. These assertions are the whole contract: same agent picking the
// task back up keeps its memory, a different agent does not inherit it.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: vi.fn(),
}));
vi.mock("../task-job-scope.js", () => ({
  resolveTaskJobServiceScope: vi.fn(async () => ({
    tenantId: "tenant",
    userId: "user",
  })),
}));
vi.mock("../task-job-run-record.js", () => ({
  finishTaskJobRun: vi.fn(),
  registerTaskJobRun: vi.fn(),
}));
vi.mock("../../../notifications/inbox.js", () => ({
  emitInboxNotification: vi.fn(),
  resolveNotifications: vi.fn(async () => 0),
}));

const TASK = "01a00e15-b33c-7aa6-b730-0de7f7d5da34";
const OTHER_TASK = "01a00e15-b33c-7aa6-b730-0de7f7d5da35";

async function checkoutThreadId(input: {
  agentTypeKey: string;
  runId: string;
  taskId?: string;
}): Promise<string> {
  const { createScopeModuleOperationInvoker } = await import(
    "../../sessions/task-workspace-hook.js"
  );
  vi.mocked(createScopeModuleOperationInvoker).mockReturnValue(
    vi.fn(async () => ({})) as never
  );
  const { checkoutStep } = await import("../task-job-steps.js");
  const result = (await checkoutStep.execute({
    inputData: {
      agent_type_key: input.agentTypeKey,
      task_id: input.taskId ?? TASK,
      tenant_id: "019fc94d-c851-7498-a2ca-db4a95401084",
    },
    runId: input.runId,
  } as never)) as { thread_id?: string };
  expect(result.thread_id).toBeTruthy();
  return result.thread_id as string;
}

describe("task job thread derivation", () => {
  it("gives the same agent the SAME thread across dispatches", async () => {
    const first = await checkoutThreadId({
      agentTypeKey: "engenty.coordinator",
      runId: "6b2f6f1e-0000-4000-8000-000000000001",
    });
    const second = await checkoutThreadId({
      agentTypeKey: "engenty.coordinator",
      runId: "6b2f6f1e-0000-4000-8000-000000000002",
    });
    expect(second).toBe(first);
  });

  it("gives a REASSIGNED agent a fresh thread — comments are the handover", async () => {
    const original = await checkoutThreadId({
      agentTypeKey: "engenty.coordinator",
      runId: "6b2f6f1e-0000-4000-8000-000000000003",
    });
    const successor = await checkoutThreadId({
      agentTypeKey: "contacts.manager",
      runId: "6b2f6f1e-0000-4000-8000-000000000004",
    });
    expect(successor).not.toBe(original);
  });

  it("keeps one agent's threads apart across tasks", async () => {
    const here = await checkoutThreadId({
      agentTypeKey: "engenty.coordinator",
      runId: "6b2f6f1e-0000-4000-8000-000000000005",
    });
    const there = await checkoutThreadId({
      agentTypeKey: "engenty.coordinator",
      runId: "6b2f6f1e-0000-4000-8000-000000000006",
      taskId: OTHER_TASK,
    });
    expect(there).not.toBe(here);
  });

  it("emits a well-formed v5-shaped uuid", async () => {
    const threadId = await checkoutThreadId({
      agentTypeKey: "engenty.coordinator",
      runId: "6b2f6f1e-0000-4000-8000-000000000009",
    });
    expect(threadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
