// Model resolution for graph runs.
//
// A delegated run that is handed no `modelConfig` does NOT fall back to the
// tenant's configuration — `assembleDynamicAgent` short-circuits to the agent's
// compiled-in `config.model`, so the tenant's bindings and AI settings are
// bypassed entirely. Every delegation started from a graph therefore has to
// resolve one, exactly as the session service does for chat.
import { createAiUsageStoreFromEnv } from "../index.js";
import type { RuntimeModelConfig } from "../registry/index.js";
import { resolveRuntimeModelConfig } from "../sessions/runtime-model-config.js";
import type { AiSessionScope } from "../sessions/types.js";
import { createTenantModelConfigResolverFromEnv } from "../tenant-model-config.js";

/**
 * The tenant's runtime model config, resolved from env-configured stores.
 *
 * Same bindings, tenant AI settings and governance grants the chat path uses —
 * only the plumbing differs, because a graph run has no thread service to take
 * them from. Each agent node then resolves within it by its OWN declared
 * purpose, which is what makes a specialist run at its authored tier.
 */
export async function resolveGraphRunModelConfig(
  scope: AiSessionScope,
  // Explicit per-run model pick (e.g. a goal's `model_id` in the task lane).
  // Fills the resolver chain's session-override slot, so it wins over tenant
  // purpose defaults — within governance grants, like every other override.
  modelIdOverride?: string | null
): Promise<RuntimeModelConfig> {
  const resolveTenantModelConfig = createTenantModelConfigResolverFromEnv();
  return await resolveRuntimeModelConfig(
    {
      getUsageStore: createAiUsageStoreFromEnv,
      ...(resolveTenantModelConfig ? { resolveTenantModelConfig } : {}),
    },
    scope,
    modelIdOverride
  );
}
