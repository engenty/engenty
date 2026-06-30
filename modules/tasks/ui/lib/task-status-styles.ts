import type { TaskStatusColor } from "../../src/schema/types.js";

/** Soft pill background / border / text for status badges (dot uses `bg-current`). */
export const TASK_STATUS_PILL_TONE: Record<TaskStatusColor, string> = {
  slate:
    "bg-slate-500/10 text-slate-800 dark:text-slate-200 border-slate-500/20",
  zinc: "bg-zinc-500/10 text-zinc-800 dark:text-zinc-200 dark:bg-zinc-500/20 border-zinc-500/20",
  blue: "bg-blue-500/10 text-blue-800 dark:text-blue-200 dark:bg-blue-500/20 border-blue-500/20",
  indigo:
    "bg-indigo-500/10 text-indigo-800 dark:text-indigo-200 dark:bg-indigo-500/20 border-indigo-500/20",
  cyan: "bg-cyan-500/10 text-cyan-800 dark:text-cyan-200 dark:bg-cyan-500/20 border-cyan-500/20",
  teal: "bg-teal-500/10 text-teal-800 dark:text-teal-200 dark:bg-teal-500/20 border-teal-500/20",
  green:
    "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 dark:bg-emerald-500/20 border-emerald-500/20",
  lime: "bg-lime-500/10 text-lime-800 dark:text-lime-200 dark:bg-lime-500/20 border-lime-500/20",
  yellow:
    "bg-yellow-400/10 text-yellow-900 dark:text-yellow-200 dark:bg-yellow-400/20 border-yellow-400/30",
  amber:
    "bg-amber-500/10 text-amber-800 dark:text-amber-200 dark:bg-amber-500/20 border-amber-500/20",
  orange:
    "bg-orange-500/10 text-orange-800 dark:text-orange-200 dark:bg-orange-500/20 border-orange-500/20",
  red: "bg-red-500/10 text-red-800 dark:text-red-200 dark:bg-red-500/20 border-red-500/20",
  rose: "bg-rose-500/10 text-rose-800 dark:text-rose-200 dark:bg-rose-500/20 border-rose-500/20",
  pink: "bg-pink-500/10 text-pink-800 dark:text-pink-200 dark:bg-pink-500/20 border-pink-500/20",
  purple:
    "bg-purple-500/10 text-purple-800 dark:text-purple-200 dark:bg-purple-500/20 border-purple-500/20",
  violet:
    "bg-violet-500/10 text-violet-800 dark:text-violet-200 dark:bg-violet-500/20 border-violet-500/20",
};

export function resolveTaskStatusPillTone(
  color: TaskStatusColor | undefined
): string {
  if (!color) {
    return "border";
  }
  return TASK_STATUS_PILL_TONE[color] ?? "border";
}

export function resolveTaskStatusDotTone(
  color: TaskStatusColor | undefined
): string {
  if (!color) {
    return "bg-zinc-500";
  }
  return TASK_STATUS_KANBAN_DOT[color] ?? "bg-zinc-500";
}

export const TASK_STATUS_FILLS: Record<TaskStatusColor, string> = {
  slate: "bg-slate-400",
  zinc: "bg-zinc-600",
  blue: "bg-blue-600",
  indigo: "bg-indigo-600",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  green: "bg-emerald-500",
  lime: "bg-lime-500",
  yellow: "bg-yellow-400",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  rose: "bg-rose-500",
  pink: "bg-pink-500",
  purple: "bg-purple-500",
  violet: "bg-violet-500",
};

/** Header dot / pill backgrounds for kanban and similar. */
export const TASK_STATUS_KANBAN_DOT: Record<TaskStatusColor, string> = {
  slate: "bg-slate-400",
  zinc: "bg-zinc-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  green: "bg-emerald-500",
  lime: "bg-lime-500",
  yellow: "bg-yellow-400",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  rose: "bg-rose-500",
  pink: "bg-pink-500",
  purple: "bg-purple-500",
  violet: "bg-violet-500",
};
