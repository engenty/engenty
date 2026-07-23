import { beforeEach, describe, expect, it, vi } from "vitest";

const createTask = vi.fn(async (input: Record<string, unknown>) => ({
  id: "task-1",
  identifier: "ENG-1",
  ...input,
}));
const listOpenTriggerTasks = vi.fn(async (): Promise<unknown[]> => []);
const recordTriggerFire = vi.fn(async () => {});

vi.mock("../dal/supabase.js", () => ({
  createTasksRepoSupabase: () => ({ createTask, listOpenTriggerTasks }),
}));
vi.mock("../dal/triggers.js", () => ({
  createTriggersRepoSupabase: () => ({ recordTriggerFire }),
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
  listOpenTriggerTasks.mockClear();
  listOpenTriggerTasks.mockResolvedValue([]);
  recordTriggerFire.mockClear();
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

  it("skips a schedule fire while the previous task is still open, and records why", async () => {
    listOpenTriggerTasks.mockResolvedValue([
      { id: "task-0", identifier: "ENG-0", status: "in_progress" },
    ]);
    const result = await fireTrigger({
      supabase: {} as never,
      trigger: makeTriggerDetail({ kind: "schedule" }),
    });
    expect(createTask).not.toHaveBeenCalled();
    expect((result as { id: string }).id).toBe("task-0");
    expect(recordTriggerFire).toHaveBeenCalledWith(
      "trigger-1",
      expect.stringContaining("ENG-0")
    );
  });

  it("does NOT apply the stacking guard to event fires — each event gets its own task", async () => {
    listOpenTriggerTasks.mockResolvedValue([
      { id: "task-0", identifier: "ENG-0", status: "todo" },
    ]);
    await fireTrigger({
      supabase: {} as never,
      trigger: makeTriggerDetail({ kind: "event" }),
    });
    expect(listOpenTriggerTasks).not.toHaveBeenCalled();
    expect(createTask).toHaveBeenCalled();
  });
});
