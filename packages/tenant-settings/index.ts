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
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): every read/write here
  // is per-tenant, so the repo resolves on a tenant-locked handle per call and
  // no service client is captured at all.
  const getTenantDb = engenty.server.getTenantDb;
  if (!getTenantDb) {
    return;
  }

  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createTenantSettingsRepoSupabase(
      getTenantDb(auth) as Parameters<
        typeof createTenantSettingsRepoSupabase
      >[0],
      auth.tenantId,
      auth.scopeId
    );

  registerTenantSettingsApi(engenty.server, repoOrFactory);
};

export default registerTenantSettingsPlugin;
