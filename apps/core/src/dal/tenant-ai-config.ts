/**
 * Fetches tenant AI config (ai.config) from tenant-settings.
 * Used by copilot and related routes for per-tenant model defaults.
 */
import { parseTenantAiSettings, type TenantAiSettings } from "@engenty/ai-core";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import { createDatabaseAdapter } from "../infra/index.js";

export const AI_CONFIG_KEY = "ai.config";

export type TenantAiConfig = TenantAiSettings;

function parseValue(raw: unknown): TenantAiConfig {
  return parseTenantAiSettings(raw);
}

/**
 * Get tenant AI config from tenant-settings. Returns empty object when
 * adapter is unavailable or setting not found.
 */
export async function getTenantAiConfig(
  config: Record<string, unknown>,
  tenantId: string | null,
  scopeId: string
): Promise<TenantAiConfig> {
  if (!tenantId) {
    return {};
  }
  const adapter = createDatabaseAdapter(config);
  if (!adapter) {
    return {};
  }
  const repo = createTenantSettingsRepoSupabase(adapter, tenantId, scopeId);
  const result = await repo.get(AI_CONFIG_KEY);
  if (!result?.value || typeof result.value !== "object") {
    return {};
  }
  return parseValue(result.value);
}
