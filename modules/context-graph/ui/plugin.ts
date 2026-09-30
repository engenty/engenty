import { DockContextGraphIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { CgSourcesPage } from "./pages/cg-sources-page.js";
import { ContextGraphPage } from "./pages/context-graph-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "context-graph",
    namespace: "context-graph",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "context_graph_explorer",
    path: "/admin/context-graph",
    component: ContextGraphPage,
    order: 130,
  });

  engenty.UI.registerRoute({
    id: "context_graph_sources",
    path: "/admin/context-graph/sources",
    component: CgSourcesPage,
    order: 131,
  });

  engenty.UI.registerAdminMenuItem({
    id: "context_graph_menu",
    section: "admin",
    label: "Context Graph",
    labelKey: "context-graph:menu.title",
    to: "/admin/context-graph",
    icon: DockContextGraphIcon,
    order: 130,
  });
}
