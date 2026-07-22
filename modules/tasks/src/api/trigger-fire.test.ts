import { describe, expect, it, vi } from "vitest";

const createTask = vi.fn(async (input: Record<string, unknown>) => ({
  id: "task-1",
  ...input,
}));
const recordTriggerFire = vi.fn(async () => {});

vi.mock("../dal/supabase.js", () => ({
  createTasksRepoSupabase: () => ({ createTask }),
}));
vi.mock("../dal/triggers.js", () => ({
  createTriggersRepoSupabase: () => ({ recordTriggerFire }),
}));

import { fireTrigger } from "./trigger-fire.js";

const triggerDetail = {
  id: "trigger-1",
  tenant_id: "tenant",
  scope_id: "scope",
  task_template: {
    agent_type_key: "contacts.manager",
    description: "Do the thing",
    priority: "medium",
    title: "Follow up",
  },
} as never;

describe("fireTrigger", () => {
  it("stamps trigger_id on the materialized task", async () => {
    await fireTrigger({
      supabase: {} as never,
      trigger: triggerDetail,
    });
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ trigger_id: "trigger-1" }),
      expect.anything()
    );
  });
});
