import { describe, expect, it } from "vitest";
import {
  defaultRoutineFormValue,
  routineFormToPayload,
  routineToFormValue,
  validateRoutineForm,
} from "./routine-form-value.js";
import type { RoutineDto } from "./routines-api.js";
import { cronToPreset, presetToCron } from "./schedule-cron.js";

const routine: RoutineDto = {
  agent_id: "tasks.assist",
  cron: "0 9 * * 1-5",
  description: "Sort the inbox",
  enabled: true,
  id: "0b9f3a52-7c1d-4e2a-9f3b-1a2b3c4d5e6f",
  last_result: null,
  last_run_at: null,
  module_id: null,
  name: "Daily Email Sort",
  next_due_at: null,
  prompt: "Check emails",
  quiet_hours: null,
  source: "custom",
  task_template_id: "11111111-2222-4333-8444-555555555555",
  task_title: "Daily Email Sort",
};

describe("routine form value mapping", () => {
  it("maps a RoutineDto into form values", () => {
    const value = routineToFormValue(routine);
    expect(value.name).toBe("Daily Email Sort");
    expect(value.description).toBe("Sort the inbox");
    expect(value.agentId).toBe("tasks.assist");
    expect(value.prompt).toBe("Check emails");
    expect(value.schedule).toEqual(cronToPreset("0 9 * * 1-5"));
  });

  it("builds the create/update payload with trimmed fields and a cron string", () => {
    const value = routineToFormValue(routine);
    const payload = routineFormToPayload({
      ...value,
      name: "  Daily Email Sort  ",
      description: "   ",
    });
    expect(payload).toEqual({
      agent_id: "tasks.assist",
      cron: presetToCron(value.schedule),
      description: null,
      name: "Daily Email Sort",
      prompt: "Check emails",
    });
  });

  it("validates required fields in order", () => {
    expect(validateRoutineForm(defaultRoutineFormValue())).toBe("nameRequired");
    expect(
      validateRoutineForm({
        ...defaultRoutineFormValue(),
        name: "x",
      })
    ).toBe("agentRequired");
    expect(
      validateRoutineForm({
        ...defaultRoutineFormValue("tasks.assist"),
        name: "x",
      })
    ).toBe("promptRequired");
    expect(validateRoutineForm(routineToFormValue(routine))).toBeNull();
  });
});
