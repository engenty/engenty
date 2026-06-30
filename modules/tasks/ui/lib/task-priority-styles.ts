import type { TaskPriority } from "../../src/schema/types.js";

const TASK_PRIORITY_DOT_TONES: Record<TaskPriority, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  low: "bg-slate-400",
  medium: "bg-amber-400",
};

export function resolveTaskPriorityDotTone(priority: TaskPriority): string {
  return TASK_PRIORITY_DOT_TONES[priority];
}
