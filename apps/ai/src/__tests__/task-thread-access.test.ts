// This rule widens a boundary that is the WHOLE boundary — the AI service
// connects with the service-role key, so RLS never runs behind it. Each case
// below is a way the widening could go wrong.

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (..._args: unknown[]) => ({}) as unknown);

vi.mock("../ai/sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));

const { canReadTaskRunThread, taskIdOfRunThread } = await import(
  "../ai/sessions/task-thread-access.js"
);

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const scope = { tenantId: "t", userId: "u-1" } as never;

const runThread = {
  created_by_user_id: null,
  route_context: { task_id: TASK_ID },
};

beforeEach(() => {
  invoke.mockClear();
  invoke.mockResolvedValue({ id: TASK_ID });
});

describe("recognising a headless run thread", () => {
  it("is one when nobody owns it and it names a task", () => {
    expect(taskIdOfRunThread(runThread)).toBe(TASK_ID);
  });

  it("is NOT one when a person owns the thread", () => {
    // Someone's chat that happens to carry a task id in route context stays
    // owner-only — otherwise a task viewer could read a colleague's chat.
    expect(
      taskIdOfRunThread({ ...runThread, created_by_user_id: "u-2" })
    ).toBeNull();
  });

  it("is NOT one without a task id", () => {
    expect(
      taskIdOfRunThread({ created_by_user_id: null, route_context: {} })
    ).toBeNull();
    expect(
      taskIdOfRunThread({
        created_by_user_id: null,
        route_context: { task_id: "  " },
      })
    ).toBeNull();
  });
});

describe("deciding whether the caller may read it", () => {
  it("asks core for the task with the caller's own credential", async () => {
    await canReadTaskRunThread({ scope, session: runThread });
    expect(invoke).toHaveBeenCalledWith("tasks_get", { id: TASK_ID });
  });

  it("allows when the caller can read the task", async () => {
    await expect(
      canReadTaskRunThread({ scope, session: runThread })
    ).resolves.toBe(true);
  });

  it("refuses when the task read is denied", async () => {
    invoke.mockRejectedValue(new Error("Forbidden"));
    await expect(
      canReadTaskRunThread({ scope, session: runThread })
    ).resolves.toBe(false);
  });

  it("refuses when the task is gone", async () => {
    invoke.mockResolvedValue(null);
    await expect(
      canReadTaskRunThread({ scope, session: runThread })
    ).resolves.toBe(false);
  });

  it("never asks core about a thread that is not a run thread", async () => {
    await expect(
      canReadTaskRunThread({
        scope,
        session: { ...runThread, created_by_user_id: "u-2" },
      })
    ).resolves.toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
