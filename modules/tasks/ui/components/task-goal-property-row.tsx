import { useTranslation } from "@engenty/i18n/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, ChevronRight, Target } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { tasksPaths } from "../lib/tasks-routes.js";
import { useGoalDetailQuery, useGoalsListQuery } from "../tasks-queries.js";
import { TaskPropertyEmpty, TaskPropertyRow } from "./task-property-row.js";

interface TaskGoalPropertyRowProps {
  disabled?: boolean;
  goalId: string | null;
  onChange: (goalId: string | null) => void;
}

export function TaskGoalPropertyRow({
  goalId,
  onChange,
  disabled,
}: TaskGoalPropertyRowProps) {
  const { t } = useTranslation("tasks");
  const [open, setOpen] = useState(false);
  const goalQuery = useGoalDetailQuery(goalId);
  const goalsQuery = useGoalsListQuery({
    page: 1,
    pageSize: 200,
    sortBy: "title",
    sortOrder: "asc",
  });

  const goals = goalsQuery.data?.data ?? [];

  const handleSelect = (nextGoalId: string | null) => {
    if (nextGoalId !== goalId) {
      onChange(nextGoalId);
    }
    setOpen(false);
  };

  const goalSummary =
    goalId && goalQuery.isLoading ? (
      <span className="text-muted-foreground text-sm">…</span>
    ) : goalId && goalQuery.data ? (
      <Link
        className="inline-flex items-center gap-1 text-primary text-sm underline-offset-4 hover:underline"
        onClick={(event) => event.stopPropagation()}
        to={tasksPaths.goalDetail(goalId)}
      >
        {goalQuery.data.title}
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      </Link>
    ) : goalId ? (
      <span className="font-mono text-xs">{goalId}</span>
    ) : (
      <TaskPropertyEmpty>{t("detail.noGoal")}</TaskPropertyEmpty>
    );

  if (disabled) {
    return (
      <TaskPropertyRow icon={Target} label={t("detail.goal")}>
        {goalSummary}
      </TaskPropertyRow>
    );
  }

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild disabled={disabled}>
        <TaskPropertyRow
          disabled={disabled}
          icon={Target}
          interactive
          label={t("detail.goal")}
          showChevron
        >
          {goalSummary}
        </TaskPropertyRow>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter>
          <CommandInput placeholder={t("detail.searchGoals")} />
          <CommandList className="max-h-56">
            <CommandEmpty>{t("detail.noGoalMatch")}</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => handleSelect(null)} value="__none__">
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    goalId === null ? "opacity-100" : "opacity-0"
                  )}
                />
                {t("detail.clearGoal")}
              </CommandItem>
              {goalsQuery.isLoading ? (
                <CommandItem disabled value="__loading__">
                  …
                </CommandItem>
              ) : (
                goals.map((goal) => (
                  <CommandItem
                    key={goal.id}
                    keywords={[goal.title]}
                    onSelect={() => handleSelect(goal.id)}
                    value={goal.title}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        goalId === goal.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {goal.title}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
