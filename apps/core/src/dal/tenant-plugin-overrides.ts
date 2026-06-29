import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./supabase-config.js";

export interface TenantPluginOverridesDal {
  getOverrides: (tenantId: string) => Promise<Record<string, boolean>>;
  setOverride: (
    tenantId: string,
    pluginId: string,
    enabled: boolean
  ) => Promise<void>;
}

export function createTenantPluginOverridesDal(
  config: Record<string, unknown>
): TenantPluginOverridesDal {
  const { url, serviceRoleKey } = resolveSupabaseConfig(config);
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const table = () => client.schema("core").from("tenant_plugin_overrides");

  async function getOverrides(
    tenantId: string
  ): Promise<Record<string, boolean>> {
    const { data, error } = await table()
      .select("plugin_id, enabled")
      .eq("tenant_id", tenantId);
    if (error) {
      throw new Error(
        `Failed to load tenant plugin overrides: ${error.message}`
      );
    }
    const out: Record<string, boolean> = {};
    for (const row of (data ?? []) as Array<{
      plugin_id: string;
      enabled: boolean;
    }>) {
      out[row.plugin_id] = row.enabled;
    }
    return out;
  }

  async function setOverride(
    tenantId: string,
    pluginId: string,
    enabled: boolean
  ): Promise<void> {
    const { error } = await table().upsert(
      {
        tenant_id: tenantId,
        plugin_id: pluginId,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,plugin_id" }
    );
    if (error) {
      throw new Error(`Failed to set tenant plugin override: ${error.message}`);
    }
  }

  return { getOverrides, setOverride };
}
