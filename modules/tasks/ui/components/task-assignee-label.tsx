import { cn } from "@engenty/ui-core";
import { Bot } from "lucide-react";
import type { Task } from "../../src/schema/types.js";
import { resolveTaskAssigneeLabel } from "../lib/format-assignee.js";

interface TaskAssigneeLabelProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  className?: string;
  task: Task;
}

export function TaskAssigneeLabel({
  task,
  assigneeProfiles,
  className,
}: TaskAssigneeLabelProps) {
  const label = resolveTaskAssigneeLabel(task, assigneeProfiles);
  const isAgent = task.primary_assignee_kind === "agent";

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate text-muted-foreground text-sm",
        className
      )}
    >
      {isAgent ? <Bot className="size-3 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
