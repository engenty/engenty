import { parseTenantAiSettings, TENANT_AI_CONFIG_KEY } from "@engenty/ai-core";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import {
  createTenantDbFactory,
  resolveTenantDbConfig,
} from "../infra/tenant-db.js";
import type { AiSessionScope, RuntimeModelConfigInput } from "./sessions.js";

export type TenantModelConfigResolver = (
  scope: AiSessionScope
) => Promise<RuntimeModelConfigInput | null>;

export function createTenantModelConfigResolverFromEnv(
  env: Record<string, unknown> = process.env as Record<string, unknown>
): TenantModelConfigResolver | null {
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): core.tenant_settings
  // is tenant-keyed — every resolve rides a tenant-locked handle.
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
    const settings = parseTenantAiSettings(result?.value);
    return {
      chatModelId: settings.chat_model_id?.trim() || null,
      routingModelId:
        settings.coordinator_model_id?.trim() ||
        settings.chat_model_id?.trim() ||
        null,
      memoryModelId: settings.memory_model_id?.trim() || null,
      researchModelId: settings.research_model_id?.trim() || null,
      planningCodingModelId: settings.planning_coding_model_id?.trim() || null,
      safeguardModelId: settings.safeguard_model_id?.trim() || null,
    };
  };
}
