import { useTranslation } from "@engenty/i18n/ui";
import {
  Calendar,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { format, parseISO } from "date-fns";
import { Calendar as CalendarIcon, Compass, Flag } from "lucide-react";
import type {
  Task,
  TaskPriority,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { resolveTaskPriorityDotTone } from "../lib/task-priority-styles.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import type { TaskAssigneeValue } from "./task-assignee-picker.js";
import { TaskAssigneePropertyRows } from "./task-assignee-property-rows.js";
import { TaskGoalPropertyRow } from "./task-goal-property-row.js";
import { TaskProjectPropertyRow } from "./task-project-property-row.js";
import { TaskPropertyEmpty, TaskPropertyRow } from "./task-property-row.js";
import { TaskStatusBadge } from "./task-status-badge.js";

interface TaskPropertiesPanelProps {
  assigneeCatalog: TeamMemberCatalogRow[];
  assigneeCatalogLoading?: boolean;
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  disabled?: boolean;
  onAssigneeChange: (value: TaskAssigneeValue) => void;
  onDueDateChange: (dueDate: string | null) => void;
  onGoalChange: (goalId: string | null) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onProjectChange: (projectId: string | null) => void;
  onStatusChange: (status: string) => void;
  task: Task;
  taskStatusDefinitions: TaskStatusDefinition[];
  teamMembersEnabled?: boolean;
}

const TASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;

function assigneeFromTask(task: Task): TaskAssigneeValue {
  return {
    primary_assignee_kind: task.primary_assignee_kind,
    primary_assignee_user_id: task.primary_assignee_user_id,
    primary_assignee_agent_type_key: task.primary_assignee_agent_type_key,
    collaborator_user_ids: task.collaborator_user_ids ?? [],
  };
}

function formatDueDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  return format(parseISO(value), "PPP");
}

export function TaskPropertiesPanel({
  task,
  taskStatusDefinitions,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onGoalChange,
  onProjectChange,
  onAssigneeChange,
  disabled,
  assigneeCatalog,
  assigneeCatalogLoading = false,
  assigneeProfiles,
  teamMembersEnabled = false,
}: TaskPropertiesPanelProps) {
  const { t } = useTranslation("tasks");
  const dueDateLabel = formatDueDate(task.due_date);

  return (
    <section
      aria-label={t("detail.properties")}
      className="flex min-w-[280px] flex-col gap-2"
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <TaskPropertyRow
            disabled={disabled}
            icon={Compass}
            interactive={!disabled}
            label={t("form.status")}
            showChevron={!disabled}
          >
            <TaskStatusBadge
              compact
              definitions={taskStatusDefinitions}
              status={task.status}
            />
          </TaskPropertyRow>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {taskStatusDefinitions.map((definition) => (
            <DropdownMenuItem
              key={definition.id}
              onClick={() => {
                if (definition.id !== task.status) {
                  onStatusChange(definition.id);
                }
              }}
            >
              <TaskStatusBadge
                compact
                definitions={taskStatusDefinitions}
                status={definition.id}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <TaskPropertyRow
            disabled={disabled}
            icon={Flag}
            interactive={!disabled}
            label={t("form.priority")}
            showChevron={!disabled}
          >
            <span className="inline-flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  resolveTaskPriorityDotTone(task.priority)
                )}
              />
              {t(`priority.${task.priority}`)}
            </span>
          </TaskPropertyRow>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {TASK_PRIORITIES.map((priority) => (
            <DropdownMenuItem
              key={priority}
              onClick={() => {
                if (priority !== task.priority) {
                  onPriorityChange(priority);
                }
              }}
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    resolveTaskPriorityDotTone(priority)
                  )}
                />
                {t(`priority.${priority}`)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <TaskAssigneePropertyRows
        assigneeProfiles={assigneeProfiles}
        catalog={assigneeCatalog}
        disabled={disabled}
        loading={assigneeCatalogLoading}
        onChange={onAssigneeChange}
        section="primary"
        teamMembersEnabled={teamMembersEnabled}
        value={assigneeFromTask(task)}
      />

      <TaskProjectPropertyRow
        disabled={disabled}
        onChange={onProjectChange}
        projectId={task.project_id}
      />

      <TaskGoalPropertyRow
        disabled={disabled}
        goalId={task.goal_id}
        onChange={onGoalChange}
      />

      <Popover modal={false}>
        <PopoverTrigger asChild disabled={disabled}>
          <TaskPropertyRow
            disabled={disabled}
            icon={CalendarIcon}
            interactive={!disabled}
            label={t("form.dueDate")}
          >
            {dueDateLabel ? (
              <span className="text-sm">{dueDateLabel}</span>
            ) : (
              <TaskPropertyEmpty>{t("detail.noDueDate")}</TaskPropertyEmpty>
            )}
          </TaskPropertyRow>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-auto p-0"
          collisionPadding={12}
          side="bottom"
          sideOffset={4}
        >
          <Calendar
            autoFocus
            mode="single"
            onSelect={(date) =>
              onDueDateChange(date ? format(date, "yyyy-MM-dd") : null)
            }
            selected={task.due_date ? parseISO(task.due_date) : undefined}
          />
        </PopoverContent>
      </Popover>

      <TaskAssigneePropertyRows
        assigneeProfiles={assigneeProfiles}
        catalog={assigneeCatalog}
        disabled={disabled}
        loading={assigneeCatalogLoading}
        onChange={onAssigneeChange}
        section="collaborators"
        teamMembersEnabled={teamMembersEnabled}
        value={assigneeFromTask(task)}
      />
    </section>
  );
}
