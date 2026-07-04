// Shared form state for custom triggers — used by the create dialog and the
// tasks-module edit page so payload shaping/validation lives in one place.
// The trigger name doubles as the materialized task's title; the instructions
// become the task description. A trigger fires on a schedule (cron via
// preset), a module event (bus event name + optional payload filter), or an
// inbound webhook (secret URL shown after creation).
import type { CustomRoutineInput, RoutineDto } from "./routines-api.js";
import {
  cronToPreset,
  type PresetSchedule,
  presetToCron,
} from "./schedule-cron.js";

export type RoutineTriggerType = "schedule" | "module-events" | "webhook";

export interface RoutineFormValue {
  agentId: string;
  description: string;
  /** module-events only: JSON object text, shallow payload match. */
  eventFilter: string;
  name: string;
  prompt: string;
  /** module-events only: canonical bus event name (`module.entity.verb`). */
  resource: string;
  schedule: PresetSchedule;
  triggerType: RoutineTriggerType;
}

export type RoutineFormErrorKey =
  | "nameRequired"
  | "agentRequired"
  | "promptRequired"
  | "resourceRequired"
  | "filterInvalid";

export function defaultRoutineFormValue(
  defaultAgentId?: string | null
): RoutineFormValue {
  return {
    agentId: defaultAgentId ?? "",
    description: "",
    eventFilter: "",
    name: "",
    prompt: "",
    resource: "",
    schedule: { type: "weekdays", hour: 9, minute: 0 },
    triggerType: "schedule",
  };
}

export function routineToFormValue(routine: RoutineDto): RoutineFormValue {
  return {
    agentId: routine.agent_id ?? "",
    description: routine.description ?? "",
    eventFilter: routine.event_filter
      ? JSON.stringify(routine.event_filter, null, 2)
      : "",
    name: routine.name,
    prompt: routine.prompt ?? "",
    resource: routine.resource ?? "",
    schedule: cronToPreset(routine.cron ?? ""),
    triggerType:
      routine.kind === "event"
        ? routine.provider_id === "webhook"
          ? "webhook"
          : "module-events"
        : "schedule",
  };
}

function parseEventFilter(
  text: string
): Record<string, unknown> | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : "invalid";
  } catch {
    return "invalid";
  }
}

// Returns the first validation error as a translation-key suffix, or null.
export function validateRoutineForm(
  value: RoutineFormValue
): RoutineFormErrorKey | null {
  if (!value.name.trim()) {
    return "nameRequired";
  }
  if (!value.agentId) {
    return "agentRequired";
  }
  if (!value.prompt.trim()) {
    return "promptRequired";
  }
  if (value.triggerType === "module-events" && !value.resource.trim()) {
    return "resourceRequired";
  }
  if (
    value.triggerType !== "schedule" &&
    parseEventFilter(value.eventFilter) === "invalid"
  ) {
    return "filterInvalid";
  }
  return null;
}

export function routineFormToPayload(
  value: RoutineFormValue
): CustomRoutineInput {
  const base = {
    agent_id: value.agentId,
    description: value.description.trim() || null,
    name: value.name.trim(),
    prompt: value.prompt.trim(),
  };
  if (value.triggerType === "schedule") {
    return { ...base, cron: presetToCron(value.schedule), kind: "schedule" };
  }
  const filter = parseEventFilter(value.eventFilter);
  return {
    ...base,
    event_filter: filter === "invalid" ? null : filter,
    kind: "event",
    provider_id: value.triggerType,
    resource:
      value.triggerType === "module-events" ? value.resource.trim() : null,
  };
}
