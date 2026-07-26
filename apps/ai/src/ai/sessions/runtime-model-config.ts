import {
  type AiEffort,
  bindingsFromList,
  clampEffort,
  graded,
  type ModelBindings,
  resolveChatModelId,
  resolvePurposeModelId,
  resolveSafeguardModelId,
} from "@engenty/ai-core";
import type { RuntimeModelConfig } from "../registry/index.js";
import type { AiSessionScope, SessionServiceOptions } from "./types.js";

export async function resolveRuntimeModelConfig(
  opts: SessionServiceOptions,
  scope: AiSessionScope,
  modelIdOverride?: string | null,
  effort?: AiEffort | null
): Promise<RuntimeModelConfig> {
  const tenantConfig = await opts.resolveTenantModelConfig?.(scope);
  const tenantChatModel = tenantConfig?.chatModelId?.trim() || null;
  // Governance allow-list: in `enforce` mode, session/tenant model pins outside
  // the policy's allowed_models are demoted to the platform/default layers at
  // resolution time (observe mode never changes behavior). A policy read
  // failure must not break model resolution.
  // Dev mode exposes the whole catalog so a new model can be tried without
  // editing governance. The preflight still enforces, so this cannot bill an
  // unlicensed model in production — it only stops resolution from filtering.
  const devMode = ["1", "true", "yes", "on"].includes(
    (process.env.ENGENTY_AI_DEV_MODELS ?? "").toLowerCase()
  );
  let bindings: ModelBindings | undefined;
  try {
    const rows = await opts.getUsageStore()?.listModelBindings?.();
    if (rows && rows.length > 0) {
      bindings = bindingsFromList(
        rows.map((r) => ({
          gateway: r.gateway,
          modelId: r.model_id,
          role: r.role,
        }))
      );
    }
  } catch {
    // Unbound roles fall back to the authored defaults, which is what the seed
    // would have written anyway — never fail a run over a binding read.
    bindings = undefined;
  }
  let allowedEfforts: readonly string[] | null = null;
  let allowedModels: readonly string[] | null = null;
  let allowedProviders: readonly string[] | null = null;
  if (scope.tenantId) {
    try {
      const policy = await opts
        .getUsageStore()
        ?.getTenantPolicy(scope.tenantId);
      allowedEfforts = policy?.allowed_efforts ?? null;
      if (policy?.enforcement_mode === "enforce") {
        allowedModels = policy.allowed_models ?? null;
        allowedProviders = policy.allowed_providers ?? null;
      }
    } catch {
      allowedModels = null;
      allowedProviders = null;
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
  // The effort pick becomes a model by way of the graded role binding, clamped
  // to what the plan grants: a tenant on a low-only plan who asks for high gets
  // low and an answer rather than an error. An explicit `model_id` still wins —
  // expert and self-hosted installs pin models deliberately.
  const clamped =
    effort == null
      ? null
      : clampEffort(effort, { allowed_efforts: allowedEfforts as never });
  const effortModelId = clamped
    ? (bindings?.get(graded(clamped))?.modelId ?? null)
    : null;
  const sessionModelId = modelIdOverride ?? effortModelId;

  return {
    // Carried so per-agent pins are checked against the same grants, without a
    // policy read per assembled sub-agent.
    grants:
      allowedModels || allowedProviders
        ? { allowed_models: allowedModels, allowed_providers: allowedProviders }
        : null,
    chatModelId: resolveChatModelId({
      allowedModels,
      allowedProviders,
      bindings,
      devMode,
      override: sessionModelId,
      purpose: "chat",
      tenantDefault: tenantChatModel,
    }),
    routingModelId: resolveChatModelId({
      allowedModels,
      allowedProviders,
      bindings,
      devMode,
      override: sessionModelId,
      purpose: "routing",
      tenantDefault:
        tenantConfig?.routingModelId?.trim() || tenantChatModel || null,
    }),
    // Research / planning tiers are agent-purpose tiers, not conversational — the
    // per-conversation override does not apply to them.
    researchModelId: resolvePurposeModelId({
      allowedModels,
      allowedProviders,
      bindings,
      devMode,
      purpose: "research",
      tenantDefault: tenantConfig?.researchModelId?.trim() || null,
    }),
    planningCodingModelId: resolvePurposeModelId({
      allowedModels,
      allowedProviders,
      bindings,
      devMode,
      purpose: "planning_coding",
      tenantDefault: tenantConfig?.planningCodingModelId?.trim() || null,
    }),
    safeguardModelId: resolveSafeguardModelId({
      allowedModels,
      allowedProviders,
      bindings,
      devMode,
      tenantDefault: tenantConfig?.safeguardModelId?.trim() || null,
    }),
  };
}
