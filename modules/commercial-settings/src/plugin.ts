import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { registerCommercialSettingsApi } from "./api/index.js";
import { createCommercialSettingsRepoSupabase } from "./dal/index.js";

const registerCommercialSettingsPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "commercial-settings.viewer",
      title: "Commercial settings viewer",
      capabilities: ["module.commercial-settings.read"],
    },
    {
      id: "commercial-settings.editor",
      title: "Commercial settings editor",
      capabilities: [
        "module.commercial-settings.read",
        "module.commercial-settings.write",
      ],
    },
  ]);
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }
  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createCommercialSettingsRepoSupabase(supabase, auth.tenantId, auth.scopeId);
  registerCommercialSettingsApi(engenty.server, repoOrFactory);
};

export default registerCommercialSettingsPlugin;
