import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import {
  PortalCreateTaskPage,
  PortalPage,
  PortalTaskDetailPage,
} from "./pages/portal/index.js";

export function projectsPublicUiContributions(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "projects",
    namespace: "projects",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "projects_portal_detail",
    path: "/portal/:projectId",
    component: PortalPage,
    order: 10,
    scope: "public",
  });

  engenty.UI.registerRoute({
    id: "projects_portal_task_create",
    path: "/portal/:projectId/tasks/new",
    component: PortalCreateTaskPage,
    order: 11,
    scope: "public",
  });

  engenty.UI.registerRoute({
    id: "projects_portal_task_detail",
    path: "/portal/:projectId/tasks/:taskId",
    component: PortalTaskDetailPage,
    order: 12,
    scope: "public",
  });
}

export function projectsPublicUiPlugin(engenty: EngentyPluginContext) {
  projectsPublicUiContributions(engenty);
}
