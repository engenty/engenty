import { describe, expect, it, vi } from "vitest";
import { EngentyCoreHttpError } from "../../core-http-client.js";

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

describe("checkoutStep redelivery idempotency", () => {
  it("marks skipped on 409 checkout conflict (redelivered dispatch)", async () => {
    const { createScopeModuleOperationInvoker } = await import(
      "../../sessions/task-workspace-hook.js"
    );
    const invoke = vi.fn(async () => {
      throw new EngentyCoreHttpError(
        "task_checkout_conflict",
        409,
        "task_checkout_conflict"
      );
    });
    vi.mocked(createScopeModuleOperationInvoker).mockReturnValue(
      invoke as never
    );

    const { checkoutStep } = await import("../task-job-steps.js");
    const result = await checkoutStep.execute({
      inputData: {
        agent_type_key: "contacts.manager",
        task_id: "task-1",
        tenant_id: "tenant-1",
      },
      runId: "run-redelivered",
    } as never);

    expect(result).toMatchObject({
      note: "task already checked out by another run",
      status: "skipped",
      task_id: "task-1",
    });
    expect(invoke).toHaveBeenCalledWith(
      "tasks_checkout",
      expect.objectContaining({ id: "task-1" })
    );
  });
});
