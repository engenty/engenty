import { DockPluginsIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { ConnectionsAdminPage } from "./pages/connections-admin-page.js";
import { ConnectionsSettingsPage } from "./pages/connections-settings-page.js";
import { ConnectorDetailPage } from "./pages/connector-detail-page.js";
import { usePendingConnectionApprovalsBadgeCount } from "./queries.js";

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
  });

  engenty.UI.registerRoute({
    id: "connections_settings_detail",
    path: "/settings/connections/:connectorId",
    component: ConnectorDetailPage,
    order: 401,
  });

  engenty.UI.registerRoute({
    id: "connections_admin",
    path: "/admin/connections",
    component: ConnectionsAdminPage,
    order: 910,
  });

  engenty.UI.registerSettingsItem({
    id: "connections_settings_menu",
    label: "Connections",
    labelKey: "connections:menu.connections",
    to: "/settings/connections",
    order: 400,
  });

  engenty.UI.registerAdminMenuItem({
    id: "connections_admin_menu",
    section: "admin",
    label: "Connections",
    labelKey: "connections:menu.connections",
    to: "/admin/connections",
    icon: DockPluginsIcon,
    order: 120,
    useBadgeCount: usePendingConnectionApprovalsBadgeCount,
  });
}
