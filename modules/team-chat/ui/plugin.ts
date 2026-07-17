import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { MessagesSquare } from "lucide-react";
import { TeamChatClientPage } from "./pages/team-chat-client-page.js";
import { useTeamChatBadgeCount } from "./queries.js";

export default function plugin(engenty: EngentyPluginContext) {
  // Realtime: message/conversation changes invalidate team-chat queries live.
  // (Cross-user message sync goes through postgres_changes — the run-event
  // bus is in-process only; see docs/wip/team-chat-module.md §6.3.)
  engenty.UI.registerLiveBinding({
    id: "team-chat",
    postgresChanges: [
      { schema: "module_team_chat", table: "messages" },
      { schema: "module_team_chat", table: "conversations" },
      { schema: "module_team_chat", table: "conversation_members" },
      { schema: "module_team_chat", table: "reactions" },
    ],
    queryRoot: ["team-chat"],
  });

  engenty.i18n.registerNamespace({
    pluginId: "team-chat",
    namespace: "team-chat",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "team_chat_module_client",
    path: "/mdl/team-chat",
    component: TeamChatClientPage,
    order: 160,
  });

  engenty.UI.registerRoute({
    id: "team_chat_module_conversation",
    path: "/mdl/team-chat/:conversationId",
    component: TeamChatClientPage,
    order: 162,
  });

  engenty.UI.registerAdminMenuItem({
    id: "team_chat_module_menu",
    section: "modules",
    label: "Team Chat",
    labelKey: "team-chat:menu.teamChat",
    icon: MessagesSquare,
    to: "/mdl/team-chat",
    order: 160,
    // Slack home-badge semantics: mentions everywhere + DM unreads.
    useBadgeCount: useTeamChatBadgeCount,
  });
}
