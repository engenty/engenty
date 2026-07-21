import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { Globe } from "lucide-react";
import { BrowserBridgeSettingsPage } from "./pages/browser-bridge-settings-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerRoute({
    id: "browser_bridge_settings",
    path: "/settings/browser-bridge",
    component: BrowserBridgeSettingsPage,
    order: 420,
    // Per-user surface: a member links their own browser extension.
    requiresAdmin: false,
  });

  engenty.UI.registerSettingsItem({
    id: "browser_bridge_settings_menu",
    label: "Browser bridge",
    to: "/settings/browser-bridge",
    icon: Globe,
    // Within engenty category
    order: 14,
    requiresAdmin: false,
  });
}
