import { useInboxAttentionCountQuery } from "@engenty/ai-ui/embed";
import { registerNotificationRenderer } from "@engenty/notifications-ui";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { ListTodo } from "lucide-react";
import { ToolApprovalNotification } from "./components/inbox/tool-approval-notification.js";
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
import { OperationsPage } from "./pages/operations-page.js";
import { TaskDetailPage } from "./pages/task-detail-page.js";
import { TaskEditPage } from "./pages/task-edit-page.js";
import { TasksListPage } from "./pages/tasks-list-page.js";
import { TasksRedirectPage } from "./pages/tasks-redirect-page.js";
import { TasksSettingsPage } from "./pages/tasks-settings-page.js";
import { WorkOverviewPage } from "./pages/work-overview-page.js";
import {
  buildAssigneeProfileMap,
  getTeamMembersPluginState,
  setTasksPluginsApi,
} from "./plugins.js";
import { registerTasksObjectWidget } from "./register-object-widget.js";
import { taskDetailOptions } from "./tasks-queries.js";
import { tasksWorkTab } from "./work-tab.js";
import { registerWorkTab, resetWorkTabs } from "./work-tabs.js";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const RESERVED_SEGMENTS = new Set([
  "briefing",
  "inbox",
  "list",
  "settings",
  "operations",
]);

export default function plugin(engenty: EngentyPluginContext) {
  resetTasksListHooks();
  resetWorkTabs();
  registerWorkTab(tasksWorkTab);
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
    registerWorkTab,
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

  // The tasks module owns what a `tool_approval` can DO: approve/deny is
  // rendered into the shell's notification list for records of that kind.
  registerNotificationRenderer("tool_approval", ToolApprovalNotification);

  // The one Tasks surface that spans spaces. An absolute path, not `/mdl/tasks/…`:
  // the shell mirrors module paths into every space and redirects the legacy
  // form into one, and this page is the opposite of that.
  engenty.UI.registerRoute({
    id: "tasks_work_overview",
    path: "/work",
    component: WorkOverviewPage,
    order: 138,
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
    id: "tasks_module_list",
    path: tasksRoutePatterns.list,
    component: TasksListPage,
    order: 141,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_settings",
    path: tasksRoutePatterns.settings,
    component: TasksSettingsPage,
    order: 144,
  });

  engenty.UI.registerRoute({
    id: "tasks_module_operations",
    path: tasksRoutePatterns.operations,
    component: OperationsPage,
    order: 143,
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

  engenty.UI.registerSettingsItem({
    id: "tasks_settings_menu",
    label: "Plan",
    labelKey: "tasks:menu.tasks",
    to: tasksPaths.settings,
    icon: ListTodo,
    // Within engenty category
    order: 11,
  });

  engenty.UI.registerAdminMenuItem({
    id: "tasks_module_menu",
    section: "modules",
    label: "Plan",
    labelKey: "tasks:menu.tasks",
    icon: ListTodo,
    to: tasksPaths.root,
    // Within engenty category (matches settings order; promoted to top rail)
    order: 11,
    // Open attention count on the app-bar icon (the shell calls this hook
    // from an always-mounted per-item component).
    useBadgeCount: () => useInboxAttentionCountQuery().data?.total,
  });

  // On the app rail beside the tools carried between spaces — hence the
  // per-row `placement`, overriding this module's space placement. Every
  // work tab registered through `registerWorkTab` shows up on this page.
  engenty.UI.registerAdminMenuItem({
    id: "tasks_work_menu",
    section: "modules",
    label: "All work",
    labelKey: "tasks:work.title",
    icon: ListTodo,
    to: "/work",
    order: 10,
    placement: "global",
  });

  // Plan is a space SECTION, not a Work-list row. The tab only renders in a
  // space that has this module mounted — the strip does not hard-code "tasks".
  engenty.UI.registerSpaceTab({
    id: "plan",
    embedOnHome: true,
    icon: ListTodo,
    label: "Plan",
    labelKey: "tasks:menu.tasks",
    order: 30,
    path: "briefing",
  });

  engenty.UI.registerCopilotContribution(tasksBriefingCopilotContribution);
  engenty.UI.registerCopilotContribution(tasksCopilotContribution);
  engenty.UI.registerCopilotContribution(tasksDetailCopilotContribution);
}
