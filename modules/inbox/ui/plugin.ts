import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Mail } from "lucide-react";
import { InboxListPage } from "./pages/inbox-list-page.js";
import { InboxSettingsPage } from "./pages/inbox-settings-page.js";
import { InboxThreadPage } from "./pages/inbox-thread-page.js";

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
    id: "inbox_module_list",
    path: "/mdl/inbox",
    component: InboxListPage,
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
    component: InboxThreadPage,
    order: 152,
  });

  engenty.UI.registerAdminMenuItem({
    id: "inbox_module_menu",
    section: "modules",
    label: "Inbox",
    labelKey: "inbox:menu.inbox",
    icon: Mail,
    to: "/mdl/inbox",
    order: 150,
  });
}
