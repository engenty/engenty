import {
  resolveChatModelId,
  resolvePurposeModelId,
  resolveSafeguardModelId,
} from "@engenty/ai-core";
import type { RuntimeModelConfig } from "../registry/index.js";
import type { AiSessionScope, SessionServiceOptions } from "./types.js";

export async function resolveRuntimeModelConfig(
  opts: SessionServiceOptions,
  scope: AiSessionScope,
  modelIdOverride?: string | null
): Promise<RuntimeModelConfig> {
  const tenantConfig = await opts.resolveTenantModelConfig?.(scope);
  const tenantChatModel = tenantConfig?.chatModelId?.trim() || null;
  // Governance allow-list: in `enforce` mode, session/tenant model pins outside
  // the policy's allowed_models are demoted to the platform/default layers at
  // resolution time (observe mode never changes behavior). A policy read
  // failure must not break model resolution.
  let allowedModels: readonly string[] | null = null;
  if (scope.tenantId) {
    try {
      const policy = await opts
        .getUsageStore()
        ?.getTenantPolicy(scope.tenantId);
      if (policy?.enforcement_mode === "enforce") {
        allowedModels = policy.allowed_models ?? null;
      }
    } catch {
      allowedModels = null;
    }
  }
  // `modelIdOverride` is the user's explicit per-conversation model pick
  // (forwardedProps.engenty.model_id). It intentionally applies to BOTH tiers:
  // the user-facing copilot is a routing-tier supervisor (subAgents > 0), so a
  // chat-only override would leave the agent the user is actually talking to on
  // the tenant default — ignoring their pick. The known downside is that
  // background routing calls (thread titles, tool search) also inherit the
  // override; isolating those from the user-facing override is a Phase-1 concern
  // once purpose resolution is unified. Do not drop the override from routing
  // without that separation, or the copilot stops honoring the model picker.
  return {
    chatModelId: resolveChatModelId({
      allowedModels,
      override: modelIdOverride,
      purpose: "chat",
      tenantDefault: tenantChatModel,
    }),
    routingModelId: resolveChatModelId({
      allowedModels,
      override: modelIdOverride,
      purpose: "routing",
      tenantDefault:
        tenantConfig?.routingModelId?.trim() || tenantChatModel || null,
    }),
    // Research / planning tiers are agent-purpose tiers, not conversational — the
    // per-conversation override does not apply to them.
    researchModelId: resolvePurposeModelId({
      allowedModels,
      purpose: "research",
      tenantDefault: tenantConfig?.researchModelId?.trim() || null,
    }),
    planningCodingModelId: resolvePurposeModelId({
      allowedModels,
      purpose: "planning_coding",
      tenantDefault: tenantConfig?.planningCodingModelId?.trim() || null,
    }),
    safeguardModelId: resolveSafeguardModelId({
      allowedModels,
      tenantDefault: tenantConfig?.safeguardModelId?.trim() || null,
    }),
  };
}
