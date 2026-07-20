// UI plugin for the Remote module: settings console for channel bindings +
// linked external identities, and the pairing claim page that messenger users
// land on to link their external identity to their engenty account.
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Satellite } from "lucide-react";
import { RemotePairPage } from "./pages/remote-pair-page.js";
import { RemoteSettingsPage } from "./pages/remote-settings-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "engenty-remote",
    namespace: "engenty-remote",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "engenty_remote_settings",
    path: "/mdl/engenty-remote/settings",
    component: RemoteSettingsPage,
    order: 35,
  });

  // Pairing claim page — reached via a link handed out in the messenger; no
  // settings menu entry on purpose.
  engenty.UI.registerRoute({
    id: "engenty_remote_pair",
    path: "/mdl/engenty-remote/pair",
    component: RemotePairPage,
    order: 36,
  });

  engenty.UI.registerSettingsItem({
    id: "engenty_remote_settings_menu",
    label: "Remote channels",
    labelKey: "engenty-remote:menu",
    to: "/mdl/engenty-remote/settings",
    icon: Satellite,
    order: 35,
  });
}
