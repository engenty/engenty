import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { ListTodo } from "lucide-react";
import { useMemo } from "react";
import { TasksSidebarPanel } from "../components/tasks-sidebar-panel.js";
import { useTasksPaths } from "../lib/use-tasks-paths.js";

/**
 * Plan's sidebar for any tasks screen — a space's (`/s/<key>/tasks/…`) or the
 * global Plan (`/tasks/…`); the panel and the root link follow where you are.
 */
export function useTasksModuleSecondaryShellNav() {
  const { t, i18n, ready } = useTranslation("tasks");
  const { secondaryNavOpen } = useShellSecondaryNav();
  const tasksPaths = useTasksPaths();

  const secondaryNavAfterItems = useMemo(
    () => <TasksSidebarPanel />,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, i18n.language]
  );

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel
        icon={ListTodo}
        label={t("menu.tasks")}
        to={tasksPaths.root}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, ready, i18n.language, tasksPaths.root]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () =>
      secondaryNavOpen ? null : { label: t("menu.tasks"), to: tasksPaths.root },
    [secondaryNavOpen, t, tasksPaths.root]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
