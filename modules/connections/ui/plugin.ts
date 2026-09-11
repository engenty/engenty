import { CONNECTIONS_ROOT_PATH } from "@engenty/ai-ui";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Blocks } from "lucide-react";
import { ConnectCompletePage } from "./pages/connect-complete-page.js";
import {
  CONNECTIONS_SETTINGS_PATH,
  ConnectionsSettingsPage,
} from "./pages/connections-settings-page.js";
import {
  ConnectionsWorkspacePage,
  LegacyConnectionsAdminRedirect,
} from "./pages/connections-workspace-page.js";
import {
  ConnectorDetailPage,
  ConnectorWorkspaceDetailPage,
} from "./pages/connector-detail-page.js";
import {
  LegacyConnectionsDetailRedirect,
  LegacyConnectionsSettingsRedirect,
} from "./pages/legacy-connections-redirect.js";
import { registerConnectionsToolCallUi } from "./register-tool-call-ui.js";

export default function plugin(engenty: EngentyPluginContext) {
  registerConnectionsToolCallUi();
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
    path: CONNECTIONS_SETTINGS_PATH,
    component: ConnectionsSettingsPage,
    order: 400,
    // Per-user surface: a member links their own accounts for agents to use.
    requiresAdmin: false,
  });

  engenty.UI.registerRoute({
    id: "connections_settings_legacy",
    path: "/settings/connections",
    component: LegacyConnectionsSettingsRedirect,
    order: 400.1,
    requiresAdmin: false,
  });

  // Popup landing page for the in-chat connect flow: posts the OAuth result
  // to window.opener and closes (see ui/connect-popup.ts for the contract).
  engenty.UI.registerRoute({
    id: "connections_oauth_complete",
    path: "/connections/oauth/complete",
    component: ConnectCompletePage,
    order: 402,
    requiresAdmin: false,
  });

  engenty.UI.registerRoute({
    id: "connections_settings_detail",
    path: `${CONNECTIONS_SETTINGS_PATH}/:connectorId`,
    component: ConnectorDetailPage,
    order: 401,
    requiresAdmin: false,
  });

  engenty.UI.registerRoute({
    id: "connections_settings_detail_legacy",
    path: "/settings/connections/:connectorId",
    component: LegacyConnectionsDetailRedirect,
    order: 401.1,
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
    to: CONNECTIONS_SETTINGS_PATH,
    icon: Blocks,
    // Promoted into Setup for admins; members keep it in Settings.
    order: 5,
    // Personal surface — members manage their own connected accounts.
    requiresAdmin: false,
  });
}
