import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { registerTenantSettingsApi } from "./src/api/index.js";
import { createTenantSettingsRepoSupabase } from "./src/dal/index.js";

export { registerTenantSettingsApi } from "./src/api/index.js";
export { createTenantSettingsRepoSupabase } from "./src/dal/index.js";
export type {
  TenantSettingRow,
  TenantSettingType,
  TenantSettingValue,
  TenantSettingValueOut,
} from "./src/types.js";

const registerTenantSettingsPlugin: EngentyPluginFactory = (engenty) => {
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }

  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createTenantSettingsRepoSupabase(supabase, auth.tenantId, auth.scopeId);

  registerTenantSettingsApi(engenty.server, repoOrFactory);
};

export default registerTenantSettingsPlugin;
