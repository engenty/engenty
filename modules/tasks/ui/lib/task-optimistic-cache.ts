import type {
  Task,
  TaskSettings,
  TaskSettingsUpdateInput,
  TaskUpdateInput,
} from "../../src/schema/types.js";

export function patchTaskSettings(
  current: TaskSettings | undefined,
  patch: TaskSettingsUpdateInput
): TaskSettings | undefined {
  return current ? { ...current, ...patch } : current;
}

export function patchTask(
  current: Task | undefined,
  patch: TaskUpdateInput
): Task | undefined {
  return current ? { ...current, ...patch } : current;
}
