// Shared form state for custom routines — used by the create dialog and the
// tasks-module edit page so payload shaping/validation lives in one place.
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
  schedules: PresetSchedule[];
}

export type RoutineFormErrorKey =
  | "nameRequired"
  | "agentRequired"
  | "promptRequired";

export const MAX_ROUTINE_SCHEDULES = 5;

export function defaultRoutineFormValue(
  defaultAgentId?: string | null
): RoutineFormValue {
  return {
    agentId: defaultAgentId ?? "",
    description: "",
    name: "",
    prompt: "",
    schedules: [{ type: "weekdays", hour: 9, minute: 0 }],
  };
}

export function routineToFormValue(routine: RoutineDto): RoutineFormValue {
  const rawSchedules = routine.schedules?.length
    ? routine.schedules
    : [routine.schedule];
  return {
    agentId: routine.agent_id ?? "",
    description: routine.description ?? "",
    name: routine.name,
    prompt: routine.prompt ?? "",
    schedules: rawSchedules.map((cron) => cronToPreset(cron)),
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
    description: value.description.trim() || null,
    name: value.name.trim(),
    prompt: value.prompt.trim(),
    schedules: value.schedules.map((preset) => presetToCron(preset)),
  };
}
