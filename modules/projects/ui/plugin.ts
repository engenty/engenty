import type { WorkTab } from "@engenty/tasks/ui/work-tabs";
import { DockProjectsIcon } from "@engenty/ui-icons";
import type {
  EngentyPluginContext,
  UiIconComponent,
} from "@engenty/ui-plugin-sdk";
import { FolderKanban, Shapes } from "lucide-react";
import { createElement, type MouseEvent as ReactMouseEvent } from "react";
import {
  createProject,
  deleteProject,
  getProject,
  getProjectSettings,
  getProjects,
  type ProjectListItem,
  setProjectSettings,
  updateProject,
} from "./api.js";
import { ProjectsShortcutsWidget } from "./components/dashboard/projects-shortcuts-widget.js";
import { ProjectArtifactsTab } from "./components/project-artifacts-tab.js";
import { projectsCopilotContribution } from "./copilot-contribution.js";
import { PROJECTS_DETAIL_SURFACE } from "./hooks/use-project-tabs.js";
import {
  ProjectDetailPage,
  ProjectsListPage,
  ProjectsSettingsPage,
} from "./pages/index.js";
import { setProjectsPluginsApi } from "./plugins.js";
import { projectsLiveBinding } from "./projects-live-binding.js";
import { projectsPublicUiContributions } from "./public-plugin.js";
import { projectsWorkTab } from "./work-tab.js";

const PROJECTS_TASKS_LIST_ENRICHER_ID = "projects";

interface ProjectLinkValue {
  label: string;
  to: string;
}

interface TasksListTaskRow {
  id: string;
  project_id: string | null;
}

// biome-ignore lint/style/useConsistentTypeDefinitions: type alias required for PluginMethodsRecord generic
type TasksListHooksApi = {
  registerListColumn: (column: {
    defaultVisible?: boolean;
    icon?: UiIconComponent;
    key: string;
    label: string;
    labelKey?: string;
    order?: number;
    renderCell: (context: {
      enrichments: Record<string, unknown>;
      navigate: (to: string) => void;
      task: TasksListTaskRow;
    }) => ReturnType<typeof createElement> | string;
  }) => void;
  registerListEnricher: (enricher: {
    enrich: (tasks: TasksListTaskRow[]) => Promise<Record<string, unknown>>;
    id: string;
  }) => void;
  registerWorkTab: (tab: WorkTab<ProjectListItem>) => void;
  [key: string]: unknown;
};

function isProjectLinkValue(value: unknown): value is ProjectLinkValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    "to" in value &&
    typeof value.label === "string" &&
    typeof value.to === "string"
  );
}

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerLiveBinding(projectsLiveBinding);
  setProjectsPluginsApi(engenty.plugins);
  projectsPublicUiContributions(engenty);

  engenty.plugins.expose({
    getProjects: async (signal?: AbortSignal) => {
      const response = await getProjects({}, signal);
      return response.data;
    },
    getProject,
    createProject,
    updateProject,
    deleteProject,
    getProjectSettings,
    setProjectSettings,
  });

  const tasksUi = engenty.plugins.get<TasksListHooksApi>("tasks");
  // Projects on the cross-space work overview Tasks owns.
  tasksUi?.registerWorkTab(projectsWorkTab);

  tasksUi?.registerListEnricher({
    id: PROJECTS_TASKS_LIST_ENRICHER_ID,
    enrich: async (tasks) => {
      const projectIds = new Set(
        tasks
          .map((task) => task.project_id)
          .filter((projectId): projectId is string => Boolean(projectId))
      );
      if (projectIds.size === 0) {
        return {};
      }

      const projects = await getProjects({ pageSize: 200 });
      const projectsById = new Map(
        projects.data.map((project) => [project.id, project.title])
      );

      return Object.fromEntries(
        tasks
          .filter((task) => task.project_id)
          .map((task) => [
            task.id,
            {
              label:
                projectsById.get(task.project_id as string) ??
                (task.project_id as string),
              to: `/mdl/projects/${task.project_id}`,
            } satisfies ProjectLinkValue,
          ])
      );
    },
  });

  tasksUi?.registerListColumn({
    key: "project",
    label: engenty.i18n.t("tasks:detail.project", { defaultValue: "Project" }),
    labelKey: "tasks:detail.project",
    icon: FolderKanban,
    order: 35,
    defaultVisible: true,
    renderCell: ({ enrichments, navigate }) => {
      const link = enrichments[PROJECTS_TASKS_LIST_ENRICHER_ID];
      if (!isProjectLinkValue(link)) {
        return "—";
      }

      return createElement(
        "button",
        {
          type: "button",
          className:
            "text-primary truncate text-sm underline-offset-4 hover:underline",
          onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            navigate(link.to);
          },
        },
        link.label
      );
    },
  });

  engenty.UI.registerRoute({
    id: "projects_module_list",
    path: "/mdl/projects",
    component: ProjectsListPage,
    order: 115,
  });

  engenty.UI.registerRoute({
    id: "projects_module_settings",
    path: "/mdl/projects/settings",
    component: ProjectsSettingsPage,
    order: 118,
  });

  engenty.UI.registerRoute({
    id: "projects_module_detail",
    path: "/mdl/projects/:id",
    component: ProjectDetailPage,
    order: 119,
  });

  engenty.UI.registerAdminMenuItem({
    id: "projects_module_menu",
    section: "modules",
    label: "Projects",
    labelKey: "projects:menu.projects",
    to: "/mdl/projects",
    icon: DockProjectsIcon,
    // Within engenty category (matches settings order; promoted to top rail)
    order: 10,
  });

  engenty.UI.registerSettingsItem({
    id: "projects_settings_menu",
    label: "Projects",
    labelKey: "projects:menu.projects",
    to: "/mdl/projects/settings",
    icon: DockProjectsIcon,
    // Within engenty category
    order: 10,
  });

  // Artifacts stored (promoted) to a project from chats — panel lives in ai-ui.
  engenty.UI.registerTab({
    id: "artifacts",
    surface: PROJECTS_DETAIL_SURFACE,
    component: ProjectArtifactsTab,
    label: "Artifacts",
    labelKey: "projects:artifactsTab",
    icon: Shapes,
    order: 310,
  });

  engenty.UI.registerCopilotContribution(projectsCopilotContribution);

  engenty.UI.registerDashboardWidget({
    id: "projects_shortcuts",
    title: "Projects shortcuts",
    description: "Quick access to projects and project settings.",
    category: "Projects",
    component: ProjectsShortcutsWidget,
    defaultSize: { w: 4, h: 2 },
    order: 115,
    starterPriority: 110,
    createDefaultConfig: () => ({}),
  });
}
