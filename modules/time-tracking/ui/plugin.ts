import { DockTimeTrackingIcon } from "@engenty/ui-core";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { TimeTrackingPage } from "./pages/index.js";
import { timeTrackingLiveBinding } from "./time-tracking-live-binding.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerLiveBinding(timeTrackingLiveBinding);

  engenty.i18n.registerNamespace({
    pluginId: "time-tracking",
    namespace: "time-tracking",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "time_tracking_module_list",
    path: "/mdl/time-tracking",
    component: TimeTrackingPage,
    order: 118,
  });

  engenty.UI.registerAdminMenuItem({
    id: "time_tracking_module_menu",
    section: "modules",
    label: "Time Tracking",
    labelKey: "time-tracking:menu",
    to: "/mdl/time-tracking",
    icon: DockTimeTrackingIcon,
    order: 118,
  });
}
