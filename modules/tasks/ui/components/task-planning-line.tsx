import { useTranslation } from "@engenty/i18n/ui";
import {
  Calendar,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { Task, TaskPriority } from "../../src/schema/types.js";
import {
  PRIORITY_META,
  PrioritySelectorContent,
  pillClass,
} from "./new-task-selectors.js";

interface TaskPlanningLineProps {
  disabled?: boolean;
  onDueDateChange: (dueDate: string | null) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  task: Task;
}

export function TaskPlanningLine({
  disabled,
  onDueDateChange,
  onPriorityChange,
  task,
}: TaskPlanningLineProps) {
  const { t } = useTranslation("tasks");
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const PriorityIcon = PRIORITY_META[task.priority].icon;
  const dueDateLabel = task.due_date
    ? format(parseISO(task.due_date), "PPP")
    : t("detail.noDueDate");
  const triggerClassName = `${pillClass} disabled:cursor-default disabled:opacity-60`;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
      <Popover modal={false} onOpenChange={setPriorityOpen} open={priorityOpen}>
        <PopoverTrigger asChild>
          <button
            className={triggerClassName}
            disabled={disabled}
            type="button"
          >
            <PriorityIcon
              className={`h-3 w-3 ${PRIORITY_META[task.priority].className}`}
            />
            <span className="text-foreground">
              {t(`priority.${task.priority}`)}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 p-1">
          <PrioritySelectorContent
            onSelect={(priority) => {
              if (priority !== task.priority) {
                onPriorityChange(priority);
              }
              setPriorityOpen(false);
            }}
            priority={task.priority}
          />
        </PopoverContent>
      </Popover>

      <Popover modal={false} onOpenChange={setDateOpen} open={dateOpen}>
        <PopoverTrigger asChild>
          <button
            className={triggerClassName}
            disabled={disabled}
            type="button"
          >
            <CalendarDays className="h-3 w-3 text-muted-foreground" />
            <span className={task.due_date ? "text-foreground" : ""}>
              {dueDateLabel}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-0"
          collisionPadding={12}
          side="bottom"
          sideOffset={4}
        >
          <Calendar
            autoFocus
            mode="single"
            onSelect={(date) => {
              onDueDateChange(date ? format(date, "yyyy-MM-dd") : null);
              setDateOpen(false);
            }}
            selected={task.due_date ? parseISO(task.due_date) : undefined}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
