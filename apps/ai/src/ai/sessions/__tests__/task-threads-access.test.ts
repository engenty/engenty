// Who may reach a task's HEADLESS agent threads, and who may write into one.
//
// These threads have no owner and no participants, so every ownership check in
// session-service would answer "no" for them. Access is the caller's right to
// read the TASK — and that right is now read AND write: the task-bound thread
// thread is the shared agent room for everyone who can see the task.
import { describe, expect, it, vi } from "vitest";
import { createThreadService } from "../session-service.js";
import type { ThreadServiceOptions } from "../types.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000002";
const otherUser = "00000000-0000-4000-8000-000000000003";
const threadId = "00000000-0000-4000-8000-000000000004";
const taskId = "00000000-0000-4000-8000-000000000005";

const invoke = vi.fn();
vi.mock("../task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));

function makeService(input?: { threadOwner?: string | null }) {
  const listHeadlessThreadsForTask = vi.fn(async () => [
    { agent_id: "engenty.coordinator", id: threadId, tenant_id: tenantId },
  ]);
  const appendMessage = vi.fn(async () => ({ message: { id: "m1" } }));
  const store = {
    appendMessage,
    getThread: vi.fn(async () => ({
      created_by_user_id:
        input?.threadOwner === undefined ? owner : input.threadOwner,
      id: threadId,
      route_context: { task_id: taskId },
      tenant_id: tenantId,
    })),
    listHeadlessThreadsForTask,
  };
  const service = createThreadService({
    getStore: () => store,
  } as unknown as ThreadServiceOptions);
  return { appendMessage, listHeadlessThreadsForTask, service };
}

describe("listTaskThreads", () => {
  it("returns the task's agent threads to someone who may read the task", async () => {
    invoke.mockResolvedValueOnce({ id: taskId });
    const { service, listHeadlessThreadsForTask } = makeService();
    const { threads } = await service.listTaskThreads({
      scope: { tenantId, userId: otherUser },
      taskId,
    } as never);
    expect(threads).toHaveLength(1);
    expect(listHeadlessThreadsForTask).toHaveBeenCalled();
  });

  it("returns nothing — and reads nothing — when the task is not visible", async () => {
    invoke.mockResolvedValueOnce(null);
    const { service, listHeadlessThreadsForTask } = makeService();
    const { threads } = await service.listTaskThreads({
      scope: { tenantId, userId: otherUser },
      taskId,
    } as never);
    expect(threads).toEqual([]);
    expect(listHeadlessThreadsForTask).not.toHaveBeenCalled();
  });

  it("treats a core failure as no access rather than as an error", async () => {
    invoke.mockRejectedValueOnce(new Error("core down"));
    const { service } = makeService();
    await expect(
      service.listTaskThreads({
        scope: { tenantId, userId: otherUser },
        taskId,
      } as never)
    ).resolves.toEqual({ threads: [] });
  });
});

describe("appendMessage ownership", () => {
  it("lets the owner append", async () => {
    const { service, appendMessage } = makeService();
    await service.appendMessage({
      parts: [],
      role: "user",
      scope: { tenantId, userId: owner },
      threadId,
    } as never);
    expect(appendMessage).toHaveBeenCalled();
  });

  it("refuses another user in the same tenant", async () => {
    // Tenancy was the ONLY filter here: any member holding a thread uuid could
    // put a message into a colleague's conversation.
    const { service, appendMessage } = makeService();
    await expect(
      service.appendMessage({
        parts: [],
        role: "user",
        scope: { tenantId, userId: otherUser },
        threadId,
      } as never)
    ).rejects.toMatchObject({ code: "agent_threads.notFound" });
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("lets a task reader append on the task-bound thread", async () => {
    invoke.mockResolvedValue({ id: taskId });
    const { service, appendMessage } = makeService({ threadOwner: null });
    await service.appendMessage({
      parts: [],
      role: "user",
      scope: { tenantId, userId: otherUser },
      threadId,
    } as never);
    expect(appendMessage).toHaveBeenCalled();
  });

  it("refuses a task thread when the caller cannot read the task", async () => {
    invoke.mockRejectedValue(new Error("Forbidden"));
    const { service, appendMessage } = makeService({ threadOwner: null });
    await expect(
      service.appendMessage({
        parts: [],
        role: "user",
        scope: { tenantId, userId: otherUser },
        threadId,
      } as never)
    ).rejects.toMatchObject({ code: "agent_threads.notFound" });
    expect(appendMessage).not.toHaveBeenCalled();
  });
});
