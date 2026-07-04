import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { registerCommercialSettingsApi } from "./api/index.js";
import { createCommercialSettingsRepoSupabase } from "./dal/index.js";

const registerCommercialSettingsPlugin: EngentyPluginFactory = (engenty) => {
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }
  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createCommercialSettingsRepoSupabase(supabase, auth.tenantId, auth.scopeId);
  registerCommercialSettingsApi(engenty.server, repoOrFactory);
};

export default registerCommercialSettingsPlugin;
