import type { FeatureFlagDefinition } from "@engenty/feature-flags";
import { mergeResolved, type ResolvedFlags } from "@engenty/feature-flags";
import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./supabase-config.js";

export interface FeatureFlagsDal {
  clearTenantOverride: (key: string, tenantId: string) => Promise<void>;
  getGlobalOverrides: () => Promise<Record<string, boolean>>;
  getManageData: (
    tenantId: string | null,
    definitions: FeatureFlagDefinition[],
    /** Commercial-package flag values (compose UNDER tenant overrides). */
    packageOverrides?: Record<string, boolean>
  ) => Promise<{
    global: Record<string, boolean>;
    tenant: Record<string, boolean>;
    package: Record<string, boolean>;
    resolved: ResolvedFlags;
  }>;
  getResolved: (
    tenantId: string | null,
    definitions: FeatureFlagDefinition[],
    packageOverrides?: Record<string, boolean>
  ) => Promise<ResolvedFlags>;
  getTenantOverrides: (tenantId: string) => Promise<Record<string, boolean>>;
  setOverrides: (
    updates: Array<{ key: string; tenant_id: string | null; enabled: boolean }>
  ) => Promise<void>;
}

function rowsToMap(
  rows: Array<{ key: string; enabled: boolean }>
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const row of rows) {
    out[row.key] = row.enabled;
  }
  return out;
}

export function createFeatureFlagsDal(
  config: Record<string, unknown>
): FeatureFlagsDal {
  const { url, serviceRoleKey } = resolveSupabaseConfig(config);
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const table = () => client.schema("core").from("feature_flags");

  async function getGlobalOverrides(): Promise<Record<string, boolean>> {
    const { data, error } = await table()
      .select("key, enabled")
      .is("tenant_id", null);
    if (error) {
      throw new Error(
        `Failed to load global feature flag overrides: ${error.message}`
      );
    }
    return rowsToMap((data ?? []) as Array<{ key: string; enabled: boolean }>);
  }

  async function getTenantOverrides(
    tenantId: string
  ): Promise<Record<string, boolean>> {
    const { data, error } = await table()
      .select("key, enabled")
      .eq("tenant_id", tenantId);
    if (error) {
      throw new Error(
        `Failed to load tenant feature flag overrides: ${error.message}`
      );
    }
    return rowsToMap((data ?? []) as Array<{ key: string; enabled: boolean }>);
  }

  async function getResolved(
    tenantId: string | null,
    definitions: FeatureFlagDefinition[],
    packageOverrides: Record<string, boolean> = {}
  ): Promise<ResolvedFlags> {
    const global = await getGlobalOverrides();
    const tenant = tenantId ? await getTenantOverrides(tenantId) : {};
    return mergeResolved(definitions, global, tenant, packageOverrides);
  }

  async function getManageData(
    tenantId: string | null,
    definitions: FeatureFlagDefinition[],
    packageOverrides: Record<string, boolean> = {}
  ): Promise<{
    global: Record<string, boolean>;
    tenant: Record<string, boolean>;
    package: Record<string, boolean>;
    resolved: ResolvedFlags;
  }> {
    const global = await getGlobalOverrides();
    const tenant = tenantId ? await getTenantOverrides(tenantId) : {};
    const resolved = mergeResolved(
      definitions,
      global,
      tenant,
      packageOverrides
    );
    return { global, tenant, package: packageOverrides, resolved };
  }

  async function setOverrides(
    updates: Array<{ key: string; tenant_id: string | null; enabled: boolean }>
  ): Promise<void> {
    const now = new Date().toISOString();
    const promises = updates.map((u) =>
      table().upsert(
        {
          key: u.key,
          tenant_id: u.tenant_id,
          enabled: u.enabled,
          updated_at: now,
        },
        { onConflict: "key,tenant_id" }
      )
    );
    const results = await Promise.all(promises);
    const err = results.find((r) => r.error);
    if (err) {
      throw new Error(`Failed to update feature flags: ${err.error?.message}`);
    }
  }

  async function clearTenantOverride(
    key: string,
    tenantId: string
  ): Promise<void> {
    const { error } = await table()
      .delete()
      .eq("key", key)
      .eq("tenant_id", tenantId);
    if (error) {
      throw new Error(`Failed to clear tenant override: ${error.message}`);
    }
  }

  return {
    getResolved,
    getGlobalOverrides,
    getTenantOverrides,
    getManageData,
    setOverrides,
    clearTenantOverride,
  };
}
