import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { ListTodo } from "lucide-react";
import { useMemo } from "react";
import { TasksSidebarPanel } from "../components/tasks-sidebar-panel.js";
import { tasksPaths } from "../lib/tasks-routes.js";

/** Unified sidebar panel for any `/mdl/tasks/*` screen. */
export function useTasksModuleSecondaryShellNav() {
  const { t, i18n, ready } = useTranslation("tasks");
  const { secondaryNavOpen } = useShellSecondaryNav();

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
    [t, ready, i18n.language]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () =>
      secondaryNavOpen ? null : { label: t("menu.tasks"), to: tasksPaths.root },
    [secondaryNavOpen, t]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
