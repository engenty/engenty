import type { TaskStatusColor } from "../api.js";

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
