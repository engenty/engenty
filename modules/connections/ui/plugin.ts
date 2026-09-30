import { CONNECTIONS_ROOT_PATH } from "@engenty/ai-ui";
import {
  CONNECTIONS_CATALOG_PATH,
  MY_CONNECTIONS_PATH,
} from "@engenty/plugin-sdk";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Blocks } from "lucide-react";
import type { ComponentType } from "react";
import { ExtensionsDialog } from "./components/marketplace/extensions-dialog.js";
import { registerExtensionsDialog } from "./extensions.js";
import { ConnectionsCatalogPage } from "./pages/connections-catalog-page.js";
import {
  ConnectionsWorkspacePage,
  LegacyConnectionsAdminRedirect,
} from "./pages/connections-workspace-page.js";
import { ConnectorWorkspaceDetailPage } from "./pages/connector-detail-page.js";
import { MyConnectionsPage } from "./pages/my-connections-page.js";
import { registerConnectionsToolCallUi } from "./register-tool-call-ui.js";

export default function plugin(engenty: EngentyPluginContext) {
  registerExtensionsDialog(ExtensionsDialog as ComponentType<never>);
  registerConnectionsToolCallUi();
  engenty.i18n.registerNamespace({
    pluginId: "connections",
    namespace: "connections",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  // The person's own accounts (PLAN-personal-connections.md).
  engenty.UI.registerRoute({
    id: "connections_mine",
    path: MY_CONNECTIONS_PATH,
    component: MyConnectionsPage,
    order: 400,
    requiresAdmin: false,
  });

  engenty.UI.registerRoute({
    id: "connections_mine_detail",
    path: `${MY_CONNECTIONS_PATH}/:connectorId`,
    component: MyConnectionsPage,
    order: 401,
    requiresAdmin: false,
  });

  // The Organisation's catalog: connectors, their OAuth clients, usage.
  engenty.UI.registerRoute({
    id: "connections_catalog",
    path: CONNECTIONS_CATALOG_PATH,
    component: ConnectionsCatalogPage,
    order: 402.5,
    requiresAdmin: true,
  });

  engenty.UI.registerRoute({
    id: "connections_catalog_detail",
    path: `${CONNECTIONS_CATALOG_PATH}/:connectorId`,
    component: ConnectionsCatalogPage,
    order: 402.6,
    requiresAdmin: true,
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
    label: "My connections",
    labelKey: "connections:menu.connections",
    to: MY_CONNECTIONS_PATH,
    icon: Blocks,
    order: 5,
    // Personal surface — everyone manages their own connected accounts.
    requiresAdmin: false,
  });
}
