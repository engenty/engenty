import { DockChatIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { CopilotChatPage } from "./pages/chat-page.js";
import { CopilotMemoryRedirect } from "./pages/memory-redirect.js";
import { CopilotChatRootRedirect } from "./pages/root-redirect.js";
import { COPILOT_CHAT_ROOT, COPILOT_MODULE } from "./paths.js";
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

  // The working-memory profile now lives on /settings/memory (Profile tab of
  // the layered memory document UI, modules/memory); keep the old URL alive.
  engenty.UI.registerRoute({
    id: "engenty_copilot_memory_settings",
    path: "/mdl/engenty-copilot/memory",
    component: CopilotMemoryRedirect,
    order: 989.5,
  });

  engenty.UI.registerCopilotApp({
    id: "engenty_copilot_app",
    label: "Engenty Copilot",
    labelKey: "engenty-copilot:menu.label",
    to: COPILOT_CHAT_ROOT,
    icon: DockChatIcon,
    order: 995,
  });

  // The settings-menu row is contributed by the memory module ("Memory",
  // /settings/memory) — no separate assistant-memory entry anymore.
  registerEngentyCopilotToolCallUi();
}
