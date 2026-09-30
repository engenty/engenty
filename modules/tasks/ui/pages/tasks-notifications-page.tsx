import { NotificationsPage } from "@engenty/notifications-ui";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";

/**
 * Plan's notifications: the shell's notification list, shown as one of
 * Plan's own pages so Plan's sidebar stays — narrowed to the space inside
 * one (`/s/<key>/tasks/notifications`), every space on the global Plan
 * (`/tasks/notifications`). Notifications stay the shell's; Plan only hosts
 * the list.
 */
export function TasksNotificationsPage() {
  const shell = useTasksModuleSecondaryShellNav();
  return <NotificationsPage shell={shell} />;
}
