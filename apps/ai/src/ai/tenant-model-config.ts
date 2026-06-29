import { parseTenantAiSettings, TENANT_AI_CONFIG_KEY } from "@engenty/ai-core";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import { createAiDatabaseAdapter } from "../infra/database.js";
import type { AiSessionScope, RuntimeModelConfigInput } from "./sessions.js";

export type TenantModelConfigResolver = (
  scope: AiSessionScope
) => Promise<RuntimeModelConfigInput | null>;

export function createTenantModelConfigResolverFromEnv(
  env: Record<string, unknown> = process.env as Record<string, unknown>
): TenantModelConfigResolver | null {
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
    const settings = parseTenantAiSettings(result?.value);
    return {
      chatModelId: settings.chat_model_id?.trim() || null,
      routingModelId:
        settings.coordinator_model_id?.trim() ||
        settings.chat_model_id?.trim() ||
        null,
      safeguardModelId: settings.safeguard_model_id?.trim() || null,
    };
  };
}
