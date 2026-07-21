import { CONNECTIONS_ROOT_PATH } from "@engenty/ai-ui";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Blocks } from "lucide-react";
import { ConnectionsSettingsPage } from "./pages/connections-settings-page.js";
import {
  ConnectionsWorkspacePage,
  LegacyConnectionsAdminRedirect,
} from "./pages/connections-workspace-page.js";
import {
  ConnectorDetailPage,
  ConnectorWorkspaceDetailPage,
} from "./pages/connector-detail-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "connections",
    namespace: "connections",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "connections_settings",
    path: "/settings/connections",
    component: ConnectionsSettingsPage,
    order: 400,
    // Per-user surface: a member links their own accounts for agents to use.
    requiresAdmin: false,
  });

  engenty.UI.registerRoute({
    id: "connections_settings_detail",
    path: "/settings/connections/:connectorId",
    component: ConnectorDetailPage,
    order: 401,
    requiresAdmin: false,
  });

  // Main entry inside the /admin/engenty workspace; the sidebar row lives in
  // ai-ui (AgentsWorkspaceSidebar), the page is module-owned.
  engenty.UI.registerRoute({
    id: "connections_workspace",
    path: CONNECTIONS_ROOT_PATH,
    component: ConnectionsWorkspacePage,
    order: 910,
  });

  engenty.UI.registerRoute({
    id: "connections_workspace_detail",
    path: `${CONNECTIONS_ROOT_PATH}/:connectorId`,
    component: ConnectorWorkspaceDetailPage,
    order: 910.5,
  });

  engenty.UI.registerRoute({
    id: "connections_admin_legacy_redirect",
    path: "/admin/connections",
    component: LegacyConnectionsAdminRedirect,
    order: 911,
  });

  engenty.UI.registerSettingsItem({
    id: "connections_settings_menu",
    label: "Connections",
    labelKey: "connections:menu.connections",
    to: "/settings/connections",
    icon: Blocks,
    // Promoted into Settings core (above module separator).
    order: 5,
    // Personal surface — members manage their own connected accounts.
    requiresAdmin: false,
  });
}
