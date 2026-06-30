/**
 * Shared Tasks “Neu” create menu — sidebar + icon trigger.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ListTodo, Plus, Target } from "lucide-react";
import type { ReactNode } from "react";

export interface TasksModuleAddMenuHandlers {
  onAddGoal: () => void;
  onAddTask: () => void;
}

function TasksModuleAddMenuItems({
  handlers,
  withShellItemProps = false,
}: {
  handlers: TasksModuleAddMenuHandlers;
  withShellItemProps?: boolean;
}) {
  const { t } = useTranslation("tasks");
  const itemProps = withShellItemProps ? shellSecondaryNavItemProps : {};

  return (
    <>
      <p
        className="px-2 py-1 font-semibold text-muted-foreground/50 text-xxs uppercase tracking-wide"
        role="presentation"
      >
        {t("addNew")}
      </p>
      <DropdownMenuGroup className="py-1">
        <DropdownMenuItem {...itemProps} onSelect={handlers.onAddTask}>
          <ListTodo aria-hidden className="h-4 w-4" />
          {t("list.newTask")}
        </DropdownMenuItem>
        <DropdownMenuItem {...itemProps} onSelect={handlers.onAddGoal}>
          <Target aria-hidden className="h-4 w-4" />
          {t("goals.newGoal")}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}

export function TasksModuleAddMenuDropdown({
  align = "start",
  handlers,
  trigger,
}: {
  align?: "end" | "start";
  handlers: TasksModuleAddMenuHandlers;
  trigger: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[12rem]">
        <TasksModuleAddMenuItems handlers={handlers} withShellItemProps />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Icon-only trigger for the Tasks secondary sidebar search row. */
export function TasksModuleAddMenuSidebarTrigger({
  handlers,
}: {
  handlers: TasksModuleAddMenuHandlers;
}) {
  const { t } = useTranslation("tasks");

  return (
    <TasksModuleAddMenuDropdown
      align="end"
      handlers={handlers}
      trigger={
        <Button
          aria-label={t("addNew")}
          className="h-8 w-8 shrink-0 border-0 p-0 shadow-none"
          title={t("addNew")}
          type="button"
          variant="ghost"
          {...shellSecondaryNavItemProps}
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
        </Button>
      }
    />
  );
}
