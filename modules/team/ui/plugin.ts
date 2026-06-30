import { TeamMemberTasksTab } from "@engenty/tasks/ui/assignee";
import { DockTeamMembersIcon } from "@engenty/ui-core";
import type {
  EngentyPluginContext,
  UiIconComponent,
} from "@engenty/ui-plugin-sdk";
import {
  createElement,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  createTeamMember,
  getTeamMembers as fetchTeamMembers,
  getTeamMember,
  updateTeamMember,
} from "./api.js";
import { TeamQuickSearchWidget } from "./components/dashboard/team-quick-search-widget.js";
import { registerTeamMemberDetailTab } from "./member-detail-tabs.js";
import {
  TeamAgentDetailPage,
  TeamAgentsListPage,
  TeamGlobalSettingsFieldsPage,
  TeamGlobalSettingsIndexRedirectPage,
  TeamGlobalSettingsTaxonomiesPage,
  TeamGraphPage,
  TeamMemberDetailPage,
  TeamMemberEditPage,
  TeamMembersImportPage,
  TeamMembersListPage,
  TeamModuleSettingsRedirectPage,
} from "./pages/index.js";
import { setTeamPluginsApi } from "./plugins.js";
import { teamMemberDetailOptions } from "./queries.js";
import { teamLiveBinding } from "./team-live-binding.js";
import {
  TEAM_AGENTS_PATH,
  TEAM_GLOBAL_SETTINGS_BASE,
  TEAM_GLOBAL_SETTINGS_FIELDS_PATH,
  TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH,
  TEAM_GRAPH_PATH,
  TEAM_IMPORT_PATH,
  TEAM_MODULE_BASE,
  TEAM_MODULE_SETTINGS_PATH,
} from "./team-paths.js";

interface UserManagementListHooksApi {
  registerListColumn: (column: {
    defaultVisible?: boolean;
    icon?: UiIconComponent;
    key: string;
    label: string;
    order?: number;
    renderCell: (context: {
      enrichments: Record<string, unknown>;
      navigate: (to: string) => void;
    }) => ReactNode;
  }) => void;
  registerListEnricher: (enricher: {
    enrich: (users: Array<{ id: string }>) => Promise<Record<string, unknown>>;
    id: string;
  }) => void;
  [key: string]: unknown;
}

interface TeamMemberLinkValue {
  id: string;
  label: string;
  to: string;
}

const TEAM_ENRICHER_ID = "team";
const TEAM_PAGE_SIZE = 200;
const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function isTeamMemberLinkValue(value: unknown): value is TeamMemberLinkValue {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "label" in value &&
      "to" in value
  );
}

async function listAllTeamMembers(signal?: AbortSignal) {
  const members: Awaited<ReturnType<typeof fetchTeamMembers>>["data"] = [];
  let page = 1;

  while (true) {
    const response = await fetchTeamMembers(
      { page, pageSize: TEAM_PAGE_SIZE },
      signal
    );
    members.push(...response.data);

    if (members.length >= response.total || response.data.length === 0) {
      return members;
    }

    page += 1;
  }
}

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerLiveBinding(teamLiveBinding);
  setTeamPluginsApi(engenty.plugins);

  // The `work` (tasks) member-detail tab. The `hr`/`time` tabs + their routes are
  // owned by the `team-hr` module, contributed through the same tab seam.
  registerTeamMemberDetailTab({
    id: "work",
    labelKey: "detail.tabs.work",
    labelDefault: "Work",
    order: 1,
    urlSuffix: "tasks",
    content: TeamMemberTasksTab,
    isVisible: ({ pluginsApi }) =>
      pluginsApi?.isPluginEnabled("tasks") ?? false,
  });
  engenty.i18n.registerNamespace({
    pluginId: "team",
    namespace: "team",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  const userManagementUi =
    engenty.plugins.get<UserManagementListHooksApi>("user-management-ui");

  userManagementUi?.registerListEnricher({
    id: TEAM_ENRICHER_ID,
    enrich: async (users) => {
      const userIds = new Set(users.map((user) => user.id));
      if (userIds.size === 0) {
        return {};
      }

      const teamMembers = await listAllTeamMembers();
      return Object.fromEntries(
        teamMembers
          .filter(
            (teamMember) =>
              teamMember.user_id && userIds.has(teamMember.user_id)
          )
          .map((teamMember) => [
            teamMember.user_id as string,
            {
              id: teamMember.id,
              label: teamMember.full_name,
              to: `/mdl/team/${teamMember.id}`,
            } satisfies TeamMemberLinkValue,
          ])
      );
    },
  });

  userManagementUi?.registerListColumn({
    key: "teamMember",
    label: engenty.i18n.t("team:menu"),
    icon: DockTeamMembersIcon,
    order: 15,
    defaultVisible: true,
    renderCell: ({ enrichments, navigate }) => {
      const link = enrichments[TEAM_ENRICHER_ID];
      if (!isTeamMemberLinkValue(link)) {
        return "-";
      }

      return createElement(
        "button",
        {
          type: "button",
          className: "text-primary text-sm underline-offset-4 hover:underline",
          onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            navigate(link.to);
          },
        },
        link.label
      );
    },
  });

  engenty.plugins.expose({
    getTeamMembers: async (
      params: Parameters<typeof fetchTeamMembers>[0] = {},
      signal?: AbortSignal
    ) => {
      const response = await fetchTeamMembers(params, signal);
      return response.data;
    },
    getTeamMember,
    createTeamMember,
    updateTeamMember,
  });

  engenty.UI.registerRoute({
    id: "team_module_list",
    path: TEAM_MODULE_BASE,
    component: TeamMembersListPage,
    order: 115,
  });

  engenty.UI.registerRoute({
    id: "team_module_import",
    path: TEAM_IMPORT_PATH,
    component: TeamMembersImportPage,
    order: 115,
  });

  engenty.UI.registerRoute({
    id: "team_module_agents",
    path: TEAM_AGENTS_PATH,
    component: TeamAgentsListPage,
    order: 116,
  });

  engenty.UI.registerRoute({
    id: "team_module_agent_detail",
    path: `${TEAM_AGENTS_PATH}/:agentId`,
    component: TeamAgentDetailPage,
    order: 117,
  });

  engenty.UI.registerRoute({
    id: "team_module_graph",
    path: TEAM_GRAPH_PATH,
    component: TeamGraphPage,
    order: 118,
  });

  engenty.UI.registerRoute({
    id: "team_global_settings",
    path: TEAM_GLOBAL_SETTINGS_BASE,
    component: TeamGlobalSettingsIndexRedirectPage,
    order: 124,
  });

  engenty.UI.registerRoute({
    id: "team_global_settings_taxonomies",
    path: TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH,
    component: TeamGlobalSettingsTaxonomiesPage,
    order: 125,
  });

  engenty.UI.registerRoute({
    id: "team_global_settings_fields",
    path: TEAM_GLOBAL_SETTINGS_FIELDS_PATH,
    component: TeamGlobalSettingsFieldsPage,
    order: 126,
  });

  engenty.UI.registerRoute({
    id: "team_module_settings",
    path: TEAM_MODULE_SETTINGS_PATH,
    component: TeamModuleSettingsRedirectPage,
    order: 119,
  });

  engenty.UI.registerRoute({
    id: "team_module_detail",
    path: "/mdl/team/:id",
    component: TeamMemberDetailPage,
    order: 120,
  });

  engenty.UI.registerRoute({
    id: "team_module_detail_tasks",
    path: "/mdl/team/:id/tasks",
    component: TeamMemberDetailPage,
    order: 120,
  });

  engenty.UI.registerRoute({
    id: "team_module_edit",
    path: "/mdl/team/:id/edit",
    component: TeamMemberEditPage,
    order: 121,
  });

  // The /hr, /hr/edit and /time routes are registered by the team-hr module.

  engenty.UI.registerNavigationPrefetch({
    id: "team_detail",
    match: (pathname) => {
      const match = pathname.match(
        new RegExp(
          `^/mdl/team/(?<id>${UUID_PATTERN})(?:/(?:edit|hr|hr/edit|time))?$`,
          "i"
        )
      );
      return match?.groups ?? null;
    },
    prefetch: ({ params, queryClient }) => {
      const id = params.id;
      if (id) {
        void queryClient.prefetchQuery(teamMemberDetailOptions(id));
      }
    },
    order: 115,
  });

  engenty.UI.registerAdminMenuItem({
    id: "team_module_menu",
    section: "modules",
    label: "Team",
    labelKey: "team:menu",
    to: TEAM_MODULE_BASE,
    icon: DockTeamMembersIcon,
    order: 115,
  });

  engenty.UI.registerDashboardWidget({
    id: "team_quick_search",
    title: engenty.i18n.t("team:widget.title", { defaultValue: "Team search" }),
    description: engenty.i18n.t("team:widget.description", {
      defaultValue: "Quick search for team members",
    }),
    category: "team",
    component: TeamQuickSearchWidget,
    defaultSize: { w: 4, h: 4 },
    starterPriority: 110,
  });

  engenty.UI.registerSettingsItem({
    id: "team_settings_menu",
    label: "Team",
    labelKey: "team:menu",
    to: TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH,
    order: 125,
  });
}
