import { describe, expect, it } from "vitest";
import type { StoredGraph } from "../workflow-canvas/graph-model.js";
import { buildRoutineShape } from "./routine-shape.js";
import type { RoutineDto, RoutineTriggerDto } from "./routines-api.js";

const scheduleTrigger: RoutineTriggerDto = {
  created_at: "2026-08-01T07:00:00.000Z",
  cron: "0 7 * * *",
  enabled: true,
  event_filter: null,
  id: "trigger-1",
  input_mapping: null,
  kind: "schedule",
  next_due_at: null,
  provider_id: null,
  resource: null,
  routine_id: "routine-1",
  shortcode: null,
  timezone: "Europe/Vienna",
  updated_at: "2026-08-01T07:00:00.000Z",
  webhook_secret: null,
};

const routine: RoutineDto = {
  workflow_input: {},
  agent_id: "contacts.inbox-importer",
  approval_grants: [],
  created_at: "2026-08-01T07:00:00.000Z",
  created_by_user_id: null,
  declaration_id: null,
  description: "Import genuine correspondents",
  enabled: true,
  id: "routine-1",
  last_fired_at: null,
  last_result: null,
  module_id: null,
  name: "Daily contact import",
  next_due_at: null,
  outcome: "Every genuine correspondent is a contact, with no duplicates.",
  quiet_hours: null,
  report: "desk_card",
  source: "custom",
  space_id: null,
  tenant_id: "tenant-1",
  triggers: [scheduleTrigger],
  updated_at: "2026-08-01T07:00:00.000Z",
  workflow_id: "graph-1",
};

/** Two entries, one node — the single-step workflow shape. */
const singleStepGraph: StoredGraph = {
  graph: [
    {
      id: "prepare",
      mapConfig: { prompt: { value: "Summarise the week" } },
      type: "mapping",
    },
    { id: "run", toolId: "run_specialist", type: "tool" },
  ],
  id: "weekly-digest",
};

describe("buildRoutineShape", () => {
  it("carries the declared promise and its report floor", () => {
    expect(
      buildRoutineShape({ graph: singleStepGraph, routine }).outcome
    ).toEqual({
      report: "desk_card",
      text: "Every genuine correspondent is a contact, with no duplicates.",
    });
  });

  it("labels a schedule wake source with its human cron reading", () => {
    const { triggers } = buildRoutineShape({ locale: "en", routine });
    expect(triggers[0]?.kind).toBe("schedule");
    expect(triggers[0]?.detail).toContain("07:00");
  });

  it("names a webhook wake source by its provider, not by its resource", () => {
    const { triggers } = buildRoutineShape({
      routine: {
        ...routine,
        triggers: [
          {
            ...scheduleTrigger,
            cron: null,
            kind: "event",
            provider_id: "webhook",
            resource: "inbox.message.received",
          },
        ],
      },
    });
    expect(triggers[0]?.label).toBe("Webhook");
  });

  it("draws every wake source — a routine has 1..n triggers", () => {
    const shape = buildRoutineShape({
      routine: {
        ...routine,
        triggers: [
          scheduleTrigger,
          { ...scheduleTrigger, cron: null, id: "trigger-2", kind: "manual" },
          { ...scheduleTrigger, cron: null, id: "trigger-3", kind: "agent" },
        ],
      },
    });
    expect(shape.triggers.map((trigger) => trigger.kind)).toEqual([
      "schedule",
      "manual",
      "agent",
    ]);
  });

  it("is pending, not empty, while the bound Action's graph loads", () => {
    const shape = buildRoutineShape({ routine });
    expect(shape.middle).toMatchObject({
      workflowId: "graph-1",
      pending: true,
      steps: [],
    });
  });

  it("collapses a compiled Action's mapping+tool pair into one step", () => {
    const shape = buildRoutineShape({ graph: singleStepGraph, routine });
    expect(shape.middle.pending).toBe(false);
    // An Action may be a graph with ONE node: the picture must not change
    // kind as the Action grows steps — it only gets longer.
    expect(shape.middle.steps).toHaveLength(1);
  });
});
