import { DockProjectsIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import {
  createProject,
  deleteProject,
  getProject,
  getProjectSettings,
  getProjects,
  setProjectSettings,
  updateProject,
} from "./api.js";
import { ProjectsShortcutsWidget } from "./components/dashboard/projects-shortcuts-widget.js";
import { projectsCopilotContribution } from "./copilot-contribution.js";
import {
  ProjectDetailPage,
  ProjectsListPage,
  ProjectsSettingsPage,
} from "./pages/index.js";
import { setProjectsPluginsApi } from "./plugins.js";
import { projectsLiveBinding } from "./projects-live-binding.js";
import { projectsPublicUiContributions } from "./public-plugin.js";

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
    order: 140,
  });

  engenty.UI.registerSettingsItem({
    id: "projects_settings_menu",
    label: "Projects",
    labelKey: "projects:menu.projects",
    to: "/mdl/projects/settings",
    icon: DockProjectsIcon,
    order: 115,
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
