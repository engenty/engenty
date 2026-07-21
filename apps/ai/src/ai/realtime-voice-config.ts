import { parseTenantAiSettings, TENANT_AI_CONFIG_KEY } from "@engenty/ai-core";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { RealtimeVoiceConfigResolver } from "../api/realtime-session-routes.js";
import { createAiDatabaseAdapter } from "../infra/database.js";

/**
 * Resolve tenant realtime-voice prefs from `ai.config.realtime_voice`. Mirrors
 * {@link createTenantModelConfigResolverFromEnv}. Returns null when no database
 * is configured so the realtime route falls back to its defaults.
 */
export function createRealtimeVoiceConfigResolverFromEnv(
  env: Record<string, unknown> = process.env as Record<string, unknown>
): RealtimeVoiceConfigResolver | null {
  const adapter = createAiDatabaseAdapter(env);
  if (!adapter) {
    return null;
  }
  return async (scope) => {
    const repo = createTenantSettingsRepoSupabase(
      adapter,
      scope.tenantId,
      "default"
    );
    const result = await repo.get(TENANT_AI_CONFIG_KEY);
    return parseTenantAiSettings(result?.value).realtime_voice ?? null;
  };
}
