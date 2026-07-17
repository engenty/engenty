import { useInboxUnseenCountQuery } from "@engenty/ai-ui/embed";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { ListTodo } from "lucide-react";
import {
  tasksBriefingCopilotContribution,
  tasksCopilotContribution,
  tasksDetailCopilotContribution,
} from "./copilot-contribution.js";
import {
  teamMembersCatalogQueryKey,
  teamMembersCatalogQueryOptions,
} from "./hooks/use-team-catalog-query.js";
import { tasksPaths, tasksRoutePatterns } from "./lib/tasks-routes.js";
import { buildTaskAssigneeMemberOptions } from "./lib/team-catalog-ui.js";
import {
  registerTasksListColumn,
  registerTasksListEnricher,
  resetTasksListHooks,
} from "./list-hooks.js";
import { BriefingPage } from "./pages/briefing-page.js";
import { GoalDetailPage } from "./pages/goal-detail-page.js";
import { GoalEditPage } from "./pages/goal-edit-page.js";
import { GoalsListPage } from "./pages/goals-list-page.js";
import { InboxPage } from "./pages/inbox-page.js";
import { OperationsPage } from "./pages/operations-page.js";
import { RoutineDetailPage } from "./pages/routine-detail-page.js";
import { RoutineEditPage } from "./pages/routine-edit-page.js";
import { RoutinesPage } from "./pages/routines-page.js";
import { TaskDetailPage } from "./pages/task-detail-page.js";
import { TaskEditPage } from "./pages/task-edit-page.js";
import { TasksListPage } from "./pages/tasks-list-page.js";
import { TasksRedirectPage } from "./pages/tasks-redirect-page.js";
import { TasksSettingsPage } from "./pages/tasks-settings-page.js";
import {
  buildAssigneeProfileMap,
  getTeamMembersPluginState,
  setTasksPluginsApi,
} from "./plugins.js";
import { registerTasksObjectWidget } from "./register-object-widget.js";
import { goalDetailOptions, taskDetailOptions } from "./tasks-queries.js";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const RESERVED_SEGMENTS = new Set([
  "briefing",
  "inbox",
  "list",
  "goals",
  "settings",
  "operations",
]);

export default function plugin(engenty: EngentyPluginContext) {
  resetTasksListHooks();
  registerTasksObjectWidget();
  // Adds the tasks LIST page binding (detail keeps its own per-page mount).
  // module_tasks.tasks is published; root is taskKeys.all (["tasks"]).
  engenty.UI.registerLiveBinding({
    id: "tasks",
    queryRoot: ["tasks"],
    postgresChanges: [{ schema: "module_tasks", table: "tasks" }],
  });
  setTasksPluginsApi(engenty.plugins);

  engenty.plugins.expose({
    buildAssigneeProfileMap,
    buildTaskAssigneeMemberOptions,
    getTeamMembersPluginState,
    registerListColumn: registerTasksListColumn,
    registerListEnricher: registerTasksListEnricher,
    teamMembersCatalogQueryKey,
    teamMembersCatalogQueryOptions,
  });

  engenty.i18n.registerNamespace({
    pluginId: "tasks",
    namespace: "tasks",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "tasks_module_root",
    path: tasksRoutePatterns.root,
    component: TasksRedirectPage,
    order: 139,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_briefing",
    path: tasksRoutePatterns.briefing,
    component: BriefingPage,
    order: 140,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_inbox",
    path: tasksRoutePatterns.inbox,
    component: InboxPage,
    order: 140,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_list",
    path: tasksRoutePatterns.list,
    component: TasksListPage,
    order: 141,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_goals",
    path: tasksRoutePatterns.goals,
    component: GoalsListPage,
    order: 142,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_settings",
    path: tasksRoutePatterns.settings,
    component: TasksSettingsPage,
    order: 144,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_routines",
    path: tasksRoutePatterns.routines,
    component: RoutinesPage,
    order: 143,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_operations",
    path: tasksRoutePatterns.operations,
    component: OperationsPage,
    order: 143,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_routine_edit",
    path: tasksRoutePatterns.routineEdit,
    component: RoutineEditPage,
    order: 144,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_routine_detail",
    path: tasksRoutePatterns.routineDetail,
    component: RoutineDetailPage,
    order: 144,
  });

  engenty.UI.registerRoute({
    id: "tasks.module.goal-edit",
    path: tasksRoutePatterns.goalEdit,
    component: GoalEditPage,
    order: 145,
  });

  engenty.UI.registerRoute({
    id: "tasks.module.goal-detail",
    path: tasksRoutePatterns.goalDetail,
    component: GoalDetailPage,
    order: 146,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_detail",
    path: tasksRoutePatterns.taskDetail,
    component: TaskDetailPage,
    order: 147,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_edit",
    path: tasksRoutePatterns.taskEdit,
    component: TaskEditPage,
    order: 148,
  });

  engenty.UI.registerNavigationPrefetch({
    id: "tasks_detail",
    match: (pathname) => {
      const match = pathname.match(
        new RegExp(`^/mdl/tasks/(?<id>${UUID_PATTERN})(?:/edit)?$`, "i")
      );
      const id = match?.groups?.id;
      if (!id || RESERVED_SEGMENTS.has(id.toLowerCase())) {
        return null;
      }
      return { id };
    },
    prefetch: ({ params, queryClient }) => {
      const id = params.id;
      if (id) {
        void queryClient.prefetchQuery(taskDetailOptions(id));
      }
    },
    order: 140,
  });

  engenty.UI.registerNavigationPrefetch({
    id: "tasks.goal-detail",
    match: (pathname) => {
      const match = pathname.match(
        new RegExp(`^/mdl/tasks/goals/(?<id>${UUID_PATTERN})(?:/edit)?$`, "i")
      );
      if (!match?.groups) {
        return null;
      }
      return match.groups;
    },
    prefetch: ({ params, queryClient }) => {
      const id = params.id;
      if (id) {
        void queryClient.prefetchQuery(goalDetailOptions(id));
      }
    },
    order: 141,
  });

  engenty.UI.registerSettingsItem({
    id: "tasks_settings_menu",
    label: "Tasks",
    labelKey: "tasks:menu.tasks",
    to: tasksPaths.settings,
    icon: ListTodo,
    order: 146,
  });

  engenty.UI.registerAdminMenuItem({
    id: "tasks_module_menu",
    section: "modules",
    label: "Tasks",
    labelKey: "tasks:menu.tasks",
    icon: ListTodo,
    to: tasksPaths.root,
    order: 145,
    // Unseen inbox count on the app-bar icon (the shell calls this hook from
    // an always-mounted per-item component).
    useBadgeCount: () => useInboxUnseenCountQuery().data?.count,
  });

  engenty.UI.registerCopilotContribution(tasksBriefingCopilotContribution);
  engenty.UI.registerCopilotContribution(tasksCopilotContribution);
  engenty.UI.registerCopilotContribution(tasksDetailCopilotContribution);
}
