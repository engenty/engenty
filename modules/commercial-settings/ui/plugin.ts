import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { CreditCard } from "lucide-react";
import { CommercialSettingsPage } from "./pages/index.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "commercial-settings",
    namespace: "commercial-settings",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "commercial_settings_settings",
    path: "/mdl/commercial-settings/settings",
    component: CommercialSettingsPage,
    order: 11,
  });

  engenty.UI.registerSettingsItem({
    id: "commercial_settings_settings_menu",
    label: "Commercial",
    labelKey: "commercial-settings:menu",
    to: "/mdl/commercial-settings/settings",
    icon: CreditCard,
    order: 11,
  });
}
