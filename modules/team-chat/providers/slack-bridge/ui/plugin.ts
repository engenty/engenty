import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Link2 } from "lucide-react";
import { SlackBridgeSettingsPage } from "./page.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "team-chat-slack-bridge",
    namespace: "team-chat-slack-bridge",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "team_chat_slack_bridge_settings",
    path: "/mdl/team-chat-slack-bridge/settings",
    component: SlackBridgeSettingsPage,
    order: 30,
  });

  engenty.UI.registerSettingsItem({
    id: "team_chat_slack_bridge_settings_menu",
    label: "Slack bridge",
    labelKey: "team-chat-slack-bridge:menu",
    to: "/mdl/team-chat-slack-bridge/settings",
    icon: Link2,
    order: 30,
  });
}
