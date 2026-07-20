import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { DockVaultIcon } from "@engenty/ui-icons";
import { KeyRound } from "lucide-react";
import { VaultPage } from "./pages/vault-page.js";

/**
 * Secrets Vault UI (UI face). Phase 1 is entirely standalone routes — no
 * dependency on the (unbuilt) tab-contribution registry (plan R1). The client /
 * project detail tabs land in phase 2 via ui/extensions.ts once that registry
 * and a contacts.detail surface exist.
 */
export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "secrets",
    namespace: "secrets",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "secrets_vault",
    path: "/mdl/secrets",
    component: VaultPage,
    order: 500,
    requiresAdmin: false, // scoped members use it; reveal is gated server-side
  });

  // Top-level app icon in the dock's "modules" section — the vault is a
  // first-class app, not a settings sub-page.
  engenty.UI.registerAdminMenuItem({
    id: "secrets_module_menu",
    section: "modules",
    label: "Secrets",
    labelKey: "secrets:menu.secrets",
    to: "/mdl/secrets",
    icon: DockVaultIcon,
    order: 500,
  });

  engenty.UI.registerSettingsItem({
    id: "secrets_settings_menu",
    label: "Secrets",
    labelKey: "secrets:menu.secrets",
    to: "/mdl/secrets",
    icon: KeyRound,
    order: 500,
    requiresAdmin: false,
  });
}
