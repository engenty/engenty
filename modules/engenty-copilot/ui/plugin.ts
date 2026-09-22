import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Brain } from "lucide-react";
import { COPILOT_SETTINGS_PATH } from "./paths.js";
import { registerEngentyCopilotToolCallUi } from "./register-tool-call-ui.js";

/**
 * The copilot module: the agent, its tools, and the composer controls the
 * app mounts on its desk. Nothing here is a page — the copilot's conversation
 * is the river, one private thread per person, drawn by the same desk a
 * specialist has (`CopilotDesk` in ai-ui, at `/copilot` and
 * `/s/<key>/copilot`); its settings are that desk's pane.
 */
export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "engenty-copilot",
    namespace: "engenty-copilot",
    loadersByLocale: {
      en: () => import("../locales/en.json").then((m) => m.default),
      de: () => import("../locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerSettingsItem({
    id: "engenty_copilot_memory_settings_menu",
    label: "Copilot",
    labelKey: "engenty-copilot:settings.menu",
    to: COPILOT_SETTINGS_PATH,
    icon: Brain,
    order: 15,
    requiresAdmin: false,
  });

  registerEngentyCopilotToolCallUi();
}
