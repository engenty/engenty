import { describe, expect, it } from "vitest";
import {
  defaultRoutineFormValue,
  routineFormToPayload,
  routineFormToRoutinePatch,
  routineToFormValue,
  validateRoutineForm,
} from "./routine-form-value.js";
import type { RoutineDto, RoutineTriggerDto } from "./routines-api.js";
import { cronToPreset, presetToCron } from "./schedule-cron.js";

const WORKFLOW_ID = "33333333-3333-4333-8333-333333333333";

const scheduleTrigger: RoutineTriggerDto = {
  created_at: "2026-08-01T09:00:00.000Z",
  cron: "0 9 * * 1-5",
  enabled: true,
  event_filter: null,
  id: "trigger-1",
  input_mapping: null,
  kind: "schedule",
  next_due_at: null,
  provider_id: null,
  resource: null,
  routine_id: "0b9f3a52-7c1d-4e2a-9f3b-1a2b3c4d5e6f",
  shortcode: null,
  timezone: null,
  updated_at: "2026-08-01T09:00:00.000Z",
  webhook_secret: null,
};

const routine: RoutineDto = {
  workflow_input: {},
  agent_id: "tasks.assist",
  approval_grants: [],
  created_at: "2026-08-01T09:00:00.000Z",
  created_by_user_id: null,
  declaration_id: null,
  description: "Sort the inbox",
  enabled: true,
  id: "0b9f3a52-7c1d-4e2a-9f3b-1a2b3c4d5e6f",
  last_fired_at: null,
  last_result: null,
  module_id: null,
  name: "Daily Email Sort",
  next_due_at: null,
  outcomes: [],
  quiet_hours: null,
  report: "quiet",
  source: "custom",
  space_id: null,
  tenant_id: "tenant-1",
  triggers: [scheduleTrigger],
  updated_at: "2026-08-01T09:00:00.000Z",
  workflow_id: WORKFLOW_ID,
};

describe("routine reporting", () => {
  it("round-trips the report floor", () => {
    const value = routineToFormValue({
      ...routine,
      report: "ask",
    });
    expect(value.reportMode).toBe("ask");
    expect(routineFormToPayload(value)).toMatchObject({
      report: "ask",
    });
    expect(routineFormToPayload(value)).not.toHaveProperty("outcomes");
    expect(routineFormToRoutinePatch(value)).not.toHaveProperty("outcomes");
  });

  it("defaults to quiet — silence unless there is something to say", () => {
    expect(routineToFormValue(routine).reportMode).toBe("quiet");
    expect(defaultRoutineFormValue().reportMode).toBe("quiet");
  });
});

describe("routine form value mapping", () => {
  it("maps a RoutineDto into form values", () => {
    const value = routineToFormValue(routine);
    expect(value.name).toBe("Daily Email Sort");
    expect(value.description).toBe("Sort the inbox");
    expect(value.agentId).toBe("tasks.assist");
    expect(value.workflowId).toBe(WORKFLOW_ID);
    expect(value.schedule).toEqual(cronToPreset("0 9 * * 1-5"));
  });

  it("keeps a timezone-carrying cron verbatim via the custom preset", () => {
    // An agent-created routine writes its cron in the routine's own timezone
    // ("0 7 * * *" + Europe/Vienna). The preset picker thinks in UTC crons —
    // round-tripping through cronToPreset/presetToCron would shift the hours
    // while the routine keeps its timezone, a double conversion.
    const value = routineToFormValue({
      ...routine,
      triggers: [
        { ...scheduleTrigger, cron: "0 7 * * *", timezone: "Europe/Vienna" },
      ],
    });
    expect(value.schedule).toEqual({
      type: "custom",
      hour: 0,
      minute: 0,
      cron: "0 7 * * *",
    });
    // Saving passes the cron through unchanged and never touches `timezone`.
    const payload = routineFormToPayload(value);
    const primary = payload.triggers?.[0];
    expect(primary?.cron).toBe("0 7 * * *");
    expect(primary && "timezone" in primary).toBe(false);
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
      description: null,
      name: "Daily Email Sort",
      report: "quiet",
      // The chosen wake source plus the standard manual/agent pair.
      triggers: [
        {
          cron: presetToCron(value.schedule),
          enabled: true,
          kind: "schedule",
        },
        { kind: "manual" },
        { kind: "agent" },
      ],
      workflow_id: WORKFLOW_ID,
    });
    expect(payload).not.toHaveProperty("outcomes");
  });

  it("builds an event payload for module-event and webhook wake sources", () => {
    const value = routineToFormValue(routine);
    expect(
      routineFormToPayload({
        ...value,
        eventFilter: '{ "type": "person" }',
        resource: "contacts.contact.created",
        triggerType: "module-events",
      })
    ).toMatchObject({
      agent_id: "tasks.assist",
      description: "Sort the inbox",
      name: "Daily Email Sort",
      triggers: [
        {
          event_filter: { type: "person" },
          input_mapping: null,
          kind: "event",
          provider_id: "module-events",
          resource: "contacts.contact.created",
        },
        { kind: "manual" },
        { kind: "agent" },
      ],
      workflow_id: WORKFLOW_ID,
    });
    expect(
      routineFormToPayload({ ...value, triggerType: "webhook" }).triggers?.[0]
    ).toMatchObject({ kind: "event", provider_id: "webhook", resource: null });
  });

  it("validates event fields", () => {
    const value = routineToFormValue(routine);
    expect(
      validateRoutineForm({ ...value, triggerType: "module-events" })
    ).toBe("resourceRequired");
    expect(
      validateRoutineForm({
        ...value,
        eventFilter: "not json",
        resource: "contacts.contact.created",
        triggerType: "module-events",
      })
    ).toBe("filterInvalid");
    expect(
      validateRoutineForm({
        ...value,
        resource: "contacts.contact.created",
        triggerType: "module-events",
      })
    ).toBeNull();
  });

  it("validates required fields in order", () => {
    expect(validateRoutineForm(defaultRoutineFormValue())).toBe("nameRequired");
    expect(
      validateRoutineForm({ ...defaultRoutineFormValue(), name: "x" })
    ).toBe("agentRequired");
    // A routine always runs something: a prompt (the default mode) or a
    // published Workflow — neither body is optional.
    expect(
      validateRoutineForm({
        ...defaultRoutineFormValue("tasks.assist"),
        name: "x",
      })
    ).toBe("promptRequired");
    expect(
      validateRoutineForm({
        ...defaultRoutineFormValue("tasks.assist"),
        mode: "workflow",
        name: "x",
      })
    ).toBe("actionRequired");
    expect(validateRoutineForm(routineToFormValue(routine))).toBeNull();
  });

  it("insists on an owner even with the workflow bound", () => {
    // The Action is what runs; only a specialist owns a routine.
    expect(
      validateRoutineForm({ ...routineToFormValue(routine), agentId: "" })
    ).toBe("agentRequired");
  });

  it("accepts an event wake source — the payload becomes the input", () => {
    expect(
      validateRoutineForm({
        ...routineToFormValue(routine),
        resource: "offers.offer.created",
        triggerType: "module-events",
      })
    ).toBeNull();
  });

  it("refuses an input mapping that is not a JSON object", () => {
    expect(
      validateRoutineForm({
        ...routineToFormValue(routine),
        inputMapping: "{oops",
        resource: "offers.offer.created",
        triggerType: "module-events",
      })
    ).toBe("mappingInvalid");
  });

  it("sends the mapping with an event fire", () => {
    const payload = routineFormToPayload({
      ...routineToFormValue(routine),
      inputMapping: '{"id":{"initData":true,"path":"record.id"}}',
      resource: "offers.offer.created",
      triggerType: "module-events",
    });
    expect(payload.triggers?.[0]?.input_mapping).toEqual({
      id: { initData: true, path: "record.id" },
    });
  });

  it("a prompt routine submits its prompt and no workflow id", () => {
    const value = {
      ...defaultRoutineFormValue("chief-of-staff"),
      name: "Morning briefing",
      prompt: "  Summarize what needs me today.  ",
    };
    expect(value.mode).toBe("prompt");
    expect(validateRoutineForm({ ...value, prompt: "  " })).toBe(
      "promptRequired"
    );
    expect(validateRoutineForm(value)).toBeNull();
    const payload = routineFormToPayload(value);
    expect(payload.prompt).toBe("Summarize what needs me today.");
    expect(payload).not.toHaveProperty("workflow_id");
    expect(
      routineFormToPayload({ ...value, mode: "workflow", workflowId: "wf-1" })
    ).toMatchObject({ workflow_id: "wf-1" });
  });

  it("reads a prompt routine back into prompt mode", () => {
    const routine = {
      agent_id: "chief-of-staff",
      description: null,
      name: "Morning briefing",
      outcome: null,
      prompt: "Summarize what needs me today.",
      report: "quiet",
      triggers: [],
      workflow_id: "wf-1",
    } as unknown as RoutineDto;
    const value = routineToFormValue(routine);
    expect(value.mode).toBe("prompt");
    expect(value.prompt).toBe("Summarize what needs me today.");
    expect(routineToFormValue({ ...routine, prompt: null }).mode).toBe(
      "workflow"
    );
  });
});
