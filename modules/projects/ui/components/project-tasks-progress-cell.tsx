import { cn } from "@engenty/ui-core";
import {
  getProjectTaskProgressTone,
  type ProjectTaskProgressSummary,
  projectTaskProgressDoneClassName,
} from "../lib/project-task-progress.js";

interface ProjectTasksProgressCellProps {
  className?: string;
  isLoading?: boolean;
  summary?: ProjectTaskProgressSummary;
}

export function ProjectTasksProgressCell({
  summary,
  isLoading = false,
  className,
}: ProjectTasksProgressCellProps) {
  if (isLoading) {
    return (
      <span className={cn("text-muted-foreground text-sm", className)}>…</span>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <span className={cn("text-muted-foreground text-sm", className)}>—</span>
    );
  }

  const tone = getProjectTaskProgressTone(summary);

  return (
    <span
      className={cn("text-sm tabular-nums", className)}
      title={`${summary.done} / ${summary.total}`}
    >
      <span className={projectTaskProgressDoneClassName(tone)}>
        {summary.done}
      </span>
      <span className="text-muted-foreground"> / {summary.total}</span>
    </span>
  );
}
