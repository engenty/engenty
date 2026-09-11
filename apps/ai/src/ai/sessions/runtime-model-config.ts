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
import type { AiGatewayModelStore } from "../../gateway-models.js";
import type { RuntimeModelConfig } from "../registry/index.js";
import type { AiSessionScope, ThreadServiceOptions } from "./types.js";

/**
 * What model resolution actually needs. Narrower than `ThreadServiceOptions`
 * (which structurally satisfies it, so session callers are unchanged) because
 * graph runs resolve models too and have no thread service to hand over.
 */
export type RuntimeModelConfigDeps = Pick<
  ThreadServiceOptions,
  "getUsageStore" | "resolveTenantModelConfig"
>;

export async function resolveRuntimeModelConfig(
  opts: RuntimeModelConfigDeps,
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
    // The concrete usage store also implements AiGatewayModelStore; the
    // AiUsageStore port it is typed as does not declare that half.
    const store = opts.getUsageStore() as
      | (ReturnType<ThreadServiceOptions["getUsageStore"]> &
          Partial<AiGatewayModelStore>)
      | null;
    const rows = await store?.listModelBindings?.();
    if (rows && rows.length > 0) {
      bindings = bindingsFromList(
        rows.map((r: { gateway: string; model_id: string; role: string }) => ({
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
  // Every graded tier's model, clamped to the plan, so an agent with its own
  // default tier can be placed on it without a second policy read.
  const gradedModelIds: Partial<Record<AiEffort, string>> = {};
  for (const tier of ["low", "medium", "high"] as const) {
    const allowed = clampEffort(tier, {
      allowed_efforts: allowedEfforts as never,
    });
    const modelId = allowed ? bindings?.get(graded(allowed))?.modelId : null;
    if (modelId) {
      gradedModelIds[tier] = modelId;
    }
  }

  return {
    // A caller that passed an effort decided the tier for this run (the
    // person's pick, or Auto's answer for their own agent); agents assembled
    // under it do not re-decide. Delegated and room turns clear this.
    effortPinned: effort != null,
    gradedModelIds,
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
    // Work-coordinator tier: same stored knob as routing (coordinator_model_id,
    // surfaced via tenantConfig.routingModelId) but a CHAT-grade role binding —
    // resolving the coordinator through the "router" binding once put a plan
    // run on the small routing model, which capped out mid-document.
    coordinatorModelId: resolveChatModelId({
      allowedModels,
      allowedProviders,
      bindings,
      devMode,
      override: sessionModelId,
      purpose: "coordinator",
      tenantDefault:
        tenantConfig?.routingModelId?.trim() || tenantChatModel || null,
    }),
    // Observational memory: its own role, not the router's. Not conversational
    // either — the observer/reflector run in the background, so the
    // per-conversation override does not apply.
    memoryModelId: resolvePurposeModelId({
      allowedModels,
      allowedProviders,
      bindings,
      devMode,
      purpose: "memory",
      tenantDefault: tenantConfig?.memoryModelId?.trim() || null,
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
