import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Brain } from "lucide-react";
import { memoryLiveBinding } from "./memory-live-binding.js";
import { MemorySettingsPage } from "./pages/memory-settings-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "memory",
    namespace: "memory",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  // Agent writes refresh the document live (the page only follows while the
  // editor is clean — a dirty editor shows the changed-underneath hint).
  engenty.UI.registerLiveBinding(memoryLiveBinding);

  engenty.UI.registerRoute({
    id: "memory_settings",
    path: "/settings/memory",
    component: MemorySettingsPage,
    order: 420,
    // Per-user surface: everyone sees their own memory; org editing is
    // enforced server-side via module.memory.* capabilities.
    requiresAdmin: false,
  });
  engenty.UI.registerSettingsItem({
    id: "memory_settings_menu",
    label: "Memory",
    labelKey: "memory:menu.memory",
    to: "/settings/memory",
    icon: Brain,
    // Within engenty category
    order: 15,
    requiresAdmin: false,
  });
}
