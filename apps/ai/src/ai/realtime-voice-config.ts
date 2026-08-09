import { parseTenantAiSettings, TENANT_AI_CONFIG_KEY } from "@engenty/ai-core";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { RealtimeVoiceConfigResolver } from "../api/realtime-session-routes.js";
import {
  createTenantDbFactory,
  resolveTenantDbConfig,
} from "../infra/tenant-db.js";

/**
 * Resolve tenant realtime-voice prefs from `ai.config.realtime_voice`. Mirrors
 * {@link createTenantModelConfigResolverFromEnv}. Returns null when no database
 * is configured so the realtime route falls back to its defaults.
 * Phase A seam: core.tenant_settings is tenant-keyed — every resolve rides a
 * tenant-locked handle.
 */
export function createRealtimeVoiceConfigResolverFromEnv(
  env: Record<string, unknown> = process.env as Record<string, unknown>
): RealtimeVoiceConfigResolver | null {
  const config = resolveTenantDbConfig(env);
  if (!config) {
    return null;
  }
  const { getTenantDb } = createTenantDbFactory(config);
  return async (scope) => {
    const repo = createTenantSettingsRepoSupabase(
      getTenantDb({ tenantId: scope.tenantId }),
      scope.tenantId,
      "default"
    );
    const result = await repo.get(TENANT_AI_CONFIG_KEY);
    return parseTenantAiSettings(result?.value).realtime_voice ?? null;
  };
}
