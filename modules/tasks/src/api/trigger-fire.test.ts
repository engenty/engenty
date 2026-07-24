import { beforeEach, describe, expect, it, vi } from "vitest";

const createTask = vi.fn(async (input: Record<string, unknown>) => ({
  id: "task-1",
  identifier: "ENG-1",
  status: "todo",
  checkout_run_id: null,
  ...input,
}));
const listTriggerTasks = vi.fn(async (): Promise<unknown[]> => []);
const updateTask = vi.fn(
  async (id: string, input: Record<string, unknown>) => ({
    id,
    identifier: "ENG-0",
    status: "backlog",
    checkout_run_id: null,
    ...input,
  })
);
const recordTriggerFire = vi.fn(async () => {});
const dispatchTaskIfReady = vi.fn(
  async (_deps: unknown, _task: unknown) => undefined
);

vi.mock("../dal/supabase.js", () => ({
  createTasksRepoSupabase: () => ({
    createTask,
    listTriggerTasks,
    updateTask,
  }),
}));
vi.mock("../dal/triggers.js", () => ({
  createTriggersRepoSupabase: () => ({ recordTriggerFire }),
}));
vi.mock("./task-dispatch-service.js", () => ({
  dispatchTaskIfReady: (deps: unknown, task: unknown): Promise<undefined> =>
    dispatchTaskIfReady(deps, task),
}));

import { fireTrigger } from "./trigger-fire.js";

function makeTriggerDetail(overrides: Record<string, unknown> = {}) {
  return {
    description: null,
    id: "trigger-1",
    kind: "event",
    tenant_id: "tenant",
    scope_id: "scope",
    task_template: {
      agent_type_key: "contacts.manager",
      description: "Do the thing",
      priority: "medium",
      title: "Follow up",
    },
    ...overrides,
  } as never;
}

beforeEach(() => {
  createTask.mockClear();
  listTriggerTasks.mockClear();
  listTriggerTasks.mockResolvedValue([]);
  updateTask.mockClear();
  recordTriggerFire.mockClear();
  dispatchTaskIfReady.mockClear();
});

describe("fireTrigger", () => {
  it("stamps trigger_id on the materialized task", async () => {
    await fireTrigger({
      supabase: {} as never,
      trigger: makeTriggerDetail(),
    });
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ trigger_id: "trigger-1" }),
      expect.anything()
    );
  });

  it("appends the trigger description as routine instructions (the ROUTINE.md body)", async () => {
    await fireTrigger({
      supabase: {} as never,
      trigger: makeTriggerDetail({
        description: "1. Reap.\n2. Review.\n3. Report.",
        kind: "schedule",
      }),
    });
    const description = createTask.mock.calls[0]?.[0]?.description as string;
    expect(description).toContain("Do the thing");
    expect(description).toContain("## Routine instructions");
    expect(description).toContain("1. Reap.");
  });

  it("skips a schedule fire while a run is still active on the standing task", async () => {
    listTriggerTasks.mockResolvedValue([
      {
        checkout_run_id: "run-9",
        id: "task-0",
        identifier: "ENG-0",
        status: "in_progress",
      },
    ]);
    const result = await fireTrigger({
      supabase: {} as never,
      trigger: makeTriggerDetail({ kind: "schedule" }),
    });
    expect(createTask).not.toHaveBeenCalled();
    expect((result as { id: string }).id).toBe("task-0");
    expect(recordTriggerFire).toHaveBeenCalledWith(
      "trigger-1",
      expect.stringContaining("run-9")
    );
  });

  it("skips a schedule fire while the standing task awaits human review", async () => {
    listTriggerTasks.mockResolvedValue([
      {
        checkout_run_id: null,
        id: "task-0",
        identifier: "ENG-0",
        status: "in_review",
      },
    ]);
    const result = await fireTrigger({
      supabase: {} as never,
      trigger: makeTriggerDetail({ kind: "schedule" }),
    });
    expect(createTask).not.toHaveBeenCalled();
    expect(dispatchTaskIfReady).not.toHaveBeenCalled();
    expect((result as { id: string }).id).toBe("task-0");
    expect(recordTriggerFire).toHaveBeenCalledWith(
      "trigger-1",
      expect.stringContaining("awaits human review")
    );
  });

  it("skips a schedule fire while the standing task is blocked", async () => {
    listTriggerTasks.mockResolvedValue([
      {
        checkout_run_id: null,
        id: "task-0",
        identifier: "ENG-0",
        status: "blocked",
      },
    ]);
    await fireTrigger({
      supabase: {} as never,
      trigger: makeTriggerDetail({ kind: "schedule" }),
    });
    expect(createTask).not.toHaveBeenCalled();
    expect(recordTriggerFire).toHaveBeenCalledWith(
      "trigger-1",
      expect.stringContaining("is blocked")
    );
  });

  it("re-dispatches a resting standing task instead of creating a sibling", async () => {
    listTriggerTasks.mockResolvedValue([
      {
        checkout_run_id: null,
        id: "task-0",
        identifier: "ENG-0",
        status: "backlog",
      },
    ]);
    const queue = { send: vi.fn() } as never;
    const result = await fireTrigger({
      queue,
      supabase: {} as never,
      trigger: makeTriggerDetail({
        description: "instructions",
        kind: "schedule",
      }),
    });
    expect(createTask).not.toHaveBeenCalled();
    expect(updateTask).toHaveBeenCalledWith(
      "task-0",
      expect.objectContaining({
        description: expect.stringContaining("## Routine instructions"),
      })
    );
    expect(dispatchTaskIfReady).toHaveBeenCalled();
    expect((result as { id: string }).id).toBe("task-0");
    expect(recordTriggerFire).toHaveBeenCalledWith(
      "trigger-1",
      expect.stringContaining("re-dispatched")
    );
  });

  it("creates a new generation when no non-terminal standing task exists", async () => {
    listTriggerTasks.mockResolvedValue([]);
    await fireTrigger({
      supabase: {} as never,
      trigger: makeTriggerDetail({ kind: "schedule" }),
    });
    expect(createTask).toHaveBeenCalled();
  });

  it("does NOT apply the standing-task path to event fires — each event gets its own task", async () => {
    listTriggerTasks.mockResolvedValue([
      { id: "task-0", identifier: "ENG-0", status: "todo" },
    ]);
    await fireTrigger({
      supabase: {} as never,
      trigger: makeTriggerDetail({ kind: "event" }),
    });
    expect(listTriggerTasks).not.toHaveBeenCalled();
    expect(createTask).toHaveBeenCalled();
  });
});
