import type { ProjectTaskCountsByStatus } from "../api.js";

export interface ProjectTaskProgressSummary {
  done: number;
  open: number;
  ratio: number;
  total: number;
}

export function summarizeProjectTaskCounts(
  counts: ProjectTaskCountsByStatus
): ProjectTaskProgressSummary {
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const done = counts.done ?? 0;
  const cancelled = counts.cancelled ?? 0;
  const open = Math.max(0, total - done - cancelled);

  return {
    done,
    open,
    total,
    ratio: total > 0 ? done / total : 0,
  };
}

export function getProjectTaskProgressTone(
  summary: ProjectTaskProgressSummary | undefined
): "complete" | "empty" | "inProgress" | "none" | "open" {
  if (!summary || summary.total === 0) {
    return "none";
  }
  if (summary.done >= summary.total) {
    return "complete";
  }
  if (summary.done === 0) {
    return "open";
  }
  return "inProgress";
}

export function projectTaskProgressDoneClassName(
  tone: ReturnType<typeof getProjectTaskProgressTone>
): string {
  switch (tone) {
    case "complete":
      return "font-medium text-emerald-600 dark:text-emerald-400";
    case "open":
      return "font-medium text-amber-600 dark:text-amber-400";
    case "inProgress":
      return "font-medium text-sky-600 dark:text-sky-400";
    default:
      return "text-muted-foreground";
  }
}
