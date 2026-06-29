import { resolveChatModelId, resolveSafeguardModelId } from "@engenty/ai-core";
import type { RuntimeModelConfig } from "../registry/index.js";
import type { AiSessionScope, SessionServiceOptions } from "./types.js";

export async function resolveRuntimeModelConfig(
  opts: SessionServiceOptions,
  scope: AiSessionScope,
  modelIdOverride?: string | null
): Promise<RuntimeModelConfig> {
  const tenantConfig = await opts.resolveTenantModelConfig?.(scope);
  const tenantChatModel = tenantConfig?.chatModelId?.trim() || null;
  return {
    chatModelId: resolveChatModelId({
      override: modelIdOverride,
      purpose: "chat",
      tenantDefault: tenantChatModel,
    }),
    routingModelId: resolveChatModelId({
      override: modelIdOverride,
      purpose: "routing",
      tenantDefault:
        tenantConfig?.routingModelId?.trim() || tenantChatModel || null,
    }),
    safeguardModelId: resolveSafeguardModelId({
      tenantDefault: tenantConfig?.safeguardModelId?.trim() || null,
    }),
  };
}
