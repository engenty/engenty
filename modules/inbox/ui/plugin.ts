import { DockInboxIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { InboxClientPage } from "./pages/inbox-client-page.js";
import { InboxSettingsPage } from "./pages/inbox-settings-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  // Realtime: new synced messages invalidate the inbox queries live.
  engenty.UI.registerLiveBinding({
    id: "inbox",
    postgresChanges: [{ schema: "module_inbox", table: "messages" }],
    queryRoot: ["inbox"],
  });

  engenty.i18n.registerNamespace({
    pluginId: "inbox",
    namespace: "inbox",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "inbox_module_client",
    path: "/mdl/inbox",
    component: InboxClientPage,
    order: 150,
  });

  // Static segment before the `:threadId` catch-all.
  engenty.UI.registerRoute({
    id: "inbox_module_settings",
    path: "/mdl/inbox/settings",
    component: InboxSettingsPage,
    order: 151,
  });

  engenty.UI.registerRoute({
    id: "inbox_module_thread",
    path: "/mdl/inbox/:threadId",
    component: InboxClientPage,
    order: 152,
  });

  engenty.UI.registerAdminMenuItem({
    id: "inbox_module_menu",
    section: "modules",
    label: "Inbox",
    labelKey: "inbox:menu.inbox",
    icon: DockInboxIcon,
    to: "/mdl/inbox",
    order: 150,
  });
}
