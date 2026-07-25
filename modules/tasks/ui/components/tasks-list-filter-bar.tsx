import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, ListFilterChip } from "@engenty/ui-core";
import { ListFilter } from "lucide-react";
import type { Goal, TaskStatusDefinition } from "../../src/schema/types.js";

export type TasksGroupBy =
  | "none"
  | "status"
  | "priority"
  | "assignee"
  | "goal"
  | "project";

export interface TasksListFilterState {
  assignee: string; // "all" | "unassigned" | user_id
  goalId: string; // "all" | goal_id
  groupBy: TasksGroupBy;
  priority: string; // "all" | "critical" | "high" | "medium" | "low"
  status: string; // "all" or specific status
}

export function getTasksGroupByOptions(
  t: (key: string, fallback?: string) => string,
  showProjectGroupBy: boolean
): { value: TasksGroupBy; label: string }[] {
  return [
    { value: "none", label: t("sidebar.groupNoneShort", "List") },
    { value: "status", label: t("sidebar.groupStatus", "Status") },
    { value: "priority", label: t("sidebar.groupPriority", "Priority") },
    { value: "assignee", label: t("sidebar.groupAssignee", "Assignee") },
    { value: "goal", label: t("sidebar.groupGoal", "Goal") },
    ...(showProjectGroupBy
      ? [
          {
            value: "project" as const,
            label: t("sidebar.groupProject", "Project"),
          },
        ]
      : []),
  ];
}

interface TasksListFilterBarProps {
  assigneeOptions: { id: string; name: string }[];
  filtersExpanded: boolean;
  goalOptions: Goal[];
  hasActiveChipFilters: boolean;
  onChange: (next: TasksListFilterState) => void;
  statusOptions: TaskStatusDefinition[];
  value: TasksListFilterState;
}

export function TasksListFilterBar({
  value,
  onChange,
  filtersExpanded,
  hasActiveChipFilters,
  statusOptions,
  assigneeOptions,
  goalOptions,
}: TasksListFilterBarProps) {
  const { t } = useTranslation("tasks");

  const statusFilterOptions = [
    { value: "all", label: t("list.filterAllStatuses", "All statuses") },
    ...statusOptions.map((status) => ({
      value: status.id,
      label: status.label,
    })),
  ];

  const assigneeFilterOptions = [
    { value: "all", label: t("sidebar.allAssignees", "All assignees") },
    { value: "unassigned", label: t("sidebar.unassigned", "Unassigned") },
    ...assigneeOptions.map((member) => ({
      value: member.id,
      label: member.name,
    })),
  ];

  const priorityFilterOptions = [
    { value: "all", label: "All priorities" },
    { value: "critical", label: t("priority.critical", "Critical") },
    { value: "high", label: t("priority.high", "High") },
    { value: "medium", label: t("priority.medium", "Medium") },
    { value: "low", label: t("priority.low", "Low") },
  ];

  const goalFilterOptions = [
    { value: "all", label: t("sidebar.allGoals", "All goals") },
    ...goalOptions.map((goal) => ({
      value: goal.id,
      label: goal.title,
    })),
  ];

  const selectedStatusLabel = statusFilterOptions.find(
    (option) => option.value === value.status
  )?.label;

  const selectedAssigneeLabel = assigneeFilterOptions.find(
    (option) => option.value === value.assignee
  )?.label;

  const selectedPriorityLabel = priorityFilterOptions.find(
    (option) => option.value === value.priority
  )?.label;

  const selectedGoalLabel = goalFilterOptions.find(
    (option) => option.value === value.goalId
  )?.label;

  const hasActiveFilters =
    value.status !== "all" ||
    value.assignee !== "all" ||
    value.priority !== "all" ||
    value.goalId !== "all";

  const handleClearAll = () => {
    onChange({
      groupBy: value.groupBy,
      status: "all",
      assignee: "all",
      priority: "all",
      goalId: "all",
    });
  };

  if (!filtersExpanded) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground",
          hasActiveChipFilters && "text-foreground"
        )}
      >
        <span className="relative inline-flex">
          <ListFilter className="h-4 w-4" />
          {hasActiveChipFilters ? (
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" />
          ) : null}
        </span>
      </span>

      <ListFilterChip
        activeLabel={selectedStatusLabel}
        ariaLabel={t("list.status", "Status")}
        clearLabel="Clear status filter"
        isActive={value.status !== "all"}
        label={t("list.status", "Status")}
        onClear={() => onChange({ ...value, status: "all" })}
        onSelect={(status) => onChange({ ...value, status })}
        options={statusFilterOptions}
        value={value.status}
      />

      <ListFilterChip
        activeLabel={selectedAssigneeLabel}
        ariaLabel={t("list.assignee", "Assignee")}
        clearLabel="Clear assignee filter"
        isActive={value.assignee !== "all"}
        label={t("list.assignee", "Assignee")}
        onClear={() => onChange({ ...value, assignee: "all" })}
        onSelect={(assignee) => onChange({ ...value, assignee })}
        options={assigneeFilterOptions}
        value={value.assignee}
      />

      <ListFilterChip
        activeLabel={selectedPriorityLabel}
        ariaLabel={t("list.priority", "Priority")}
        clearLabel="Clear priority filter"
        isActive={value.priority !== "all"}
        label={t("list.priority", "Priority")}
        onClear={() => onChange({ ...value, priority: "all" })}
        onSelect={(priority) => onChange({ ...value, priority })}
        options={priorityFilterOptions}
        value={value.priority}
      />

      <ListFilterChip
        activeLabel={selectedGoalLabel}
        ariaLabel={t("detail.goal", "Goal")}
        clearLabel="Clear goal filter"
        isActive={value.goalId !== "all"}
        label={t("detail.goal", "Goal")}
        onClear={() => onChange({ ...value, goalId: "all" })}
        onSelect={(goalId) => onChange({ ...value, goalId })}
        options={goalFilterOptions}
        value={value.goalId}
      />

      {hasActiveFilters ? (
        <Button
          className="h-8 px-2 text-sm"
          onClick={handleClearAll}
          size="sm"
          type="button"
          variant="link"
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
