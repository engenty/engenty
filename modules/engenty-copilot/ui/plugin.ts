import { DockChatIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Brain } from "lucide-react";
import { CopilotChatPage } from "./pages/chat-page.js";
import { CopilotMemoryPage } from "./pages/memory-page.js";
import { CopilotChatRootRedirect } from "./pages/root-redirect.js";
import { COPILOT_CHAT_ROOT, COPILOT_MEMORY, COPILOT_MODULE } from "./paths.js";
import { registerEngentyCopilotToolCallUi } from "./register-tool-call-ui.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "engenty-copilot",
    namespace: "engenty-copilot",
    loadersByLocale: {
      en: () => import("../locales/en.json").then((m) => m.default),
      de: () => import("../locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "engenty_copilot_module_redirect",
    path: COPILOT_MODULE,
    component: CopilotChatRootRedirect,
    order: 988,
  });

  engenty.UI.registerRoute({
    id: "engenty_copilot_module_chat_redirect",
    path: COPILOT_CHAT_ROOT,
    component: CopilotChatRootRedirect,
    order: 988.5,
  });

  engenty.UI.registerRoute({
    id: "engenty_copilot_module_chat",
    path: "/mdl/engenty-copilot/chat/:threadId",
    component: CopilotChatPage,
    order: 989,
  });

  engenty.UI.registerRoute({
    id: "engenty_copilot_memory_settings",
    path: COPILOT_MEMORY,
    component: CopilotMemoryPage,
    order: 989.5,
    requiresAdmin: false,
  });

  engenty.UI.registerSettingsItem({
    id: "engenty_copilot_memory_settings_menu",
    label: "Memory",
    labelKey: "engenty-copilot:memory.menu",
    to: COPILOT_MEMORY,
    icon: Brain,
    order: 15,
    requiresAdmin: false,
  });

  engenty.UI.registerCopilotApp({
    id: "engenty_copilot_app",
    label: "Engenty Copilot",
    labelKey: "engenty-copilot:menu.label",
    to: COPILOT_CHAT_ROOT,
    icon: DockChatIcon,
    order: 995,
  });

  registerEngentyCopilotToolCallUi();
}
