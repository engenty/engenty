// Shared form state for custom routines (schedule triggers) — used by the
// create dialog and the tasks-module edit page so payload shaping/validation
// lives in one place. The routine name doubles as the materialized task's
// title; the instructions become the task description.
import type { CustomRoutineInput, RoutineDto } from "./routines-api.js";
import {
  cronToPreset,
  type PresetSchedule,
  presetToCron,
} from "./schedule-cron.js";

export interface RoutineFormValue {
  agentId: string;
  description: string;
  name: string;
  prompt: string;
  schedule: PresetSchedule;
}

export type RoutineFormErrorKey =
  | "nameRequired"
  | "agentRequired"
  | "promptRequired";

export function defaultRoutineFormValue(
  defaultAgentId?: string | null
): RoutineFormValue {
  return {
    agentId: defaultAgentId ?? "",
    description: "",
    name: "",
    prompt: "",
    schedule: { type: "weekdays", hour: 9, minute: 0 },
  };
}

export function routineToFormValue(routine: RoutineDto): RoutineFormValue {
  return {
    agentId: routine.agent_id ?? "",
    description: routine.description ?? "",
    name: routine.name,
    prompt: routine.prompt ?? "",
    schedule: cronToPreset(routine.cron ?? ""),
  };
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
  return null;
}

export function routineFormToPayload(
  value: RoutineFormValue
): CustomRoutineInput {
  return {
    agent_id: value.agentId,
    cron: presetToCron(value.schedule),
    description: value.description.trim() || null,
    name: value.name.trim(),
    prompt: value.prompt.trim(),
  };
}
