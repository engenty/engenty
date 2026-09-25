import {
  type AiEffort,
  bindingsFromList,
  clampEffort,
  graded,
  type ModelBindings,
  resolveChatModelId,
  resolvePurposeModelId,
} from "@engenty/ai-core";
import type { AiGatewayModelStore } from "../../gateway-models.js";
import { createContextTokensResolver } from "../registry/history-token-budget.js";
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
    // A failed read resolves from the process snapshot of the same table.
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
  // (forwardedProps.engenty.model_id). It applies to the chat model only:
  // background jobs (fast text, classifier) resolve their own roles and never
  // inherit a conversation's pick.
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
    // Background text jobs (observational memory, titles, summaries): no
    // tools, no per-conversation override.
    fastTextModelId: resolvePurposeModelId({
      allowedModels,
      allowedProviders,
      bindings,
      devMode,
      purpose: "fast_text",
      tenantDefault: tenantConfig?.fastTextModelId?.trim() || null,
    }),
    // Pick-one-of-N questions, guardrails included. A model ref: the
    // classifier client decides whether it speaks Jev or structured output.
    classifierModelId: resolvePurposeModelId({
      allowedModels,
      allowedProviders,
      bindings,
      devMode,
      purpose: "classifier",
      tenantDefault: tenantConfig?.classifierModelId?.trim() || null,
    }),
    // The catalog's window for whichever model an agent lands on — read at
    // assembly per agent, since pins and tiers are decided there.
    resolveContextTokens: contextTokensResolverFor(opts),
  };
}

// One cached resolver per store instance: catalog rows do not change per
// tenant or per run, so a lookup per model id per process is enough.
const contextTokensResolvers = new WeakMap<
  object,
  ReturnType<typeof createContextTokensResolver>
>();
function contextTokensResolverFor(opts: RuntimeModelConfigDeps) {
  const store = opts.getUsageStore();
  if (!store) {
    return createContextTokensResolver(() => null);
  }
  let resolver = contextTokensResolvers.get(store);
  if (!resolver) {
    resolver = createContextTokensResolver(() => store);
    contextTokensResolvers.set(store, resolver);
  }
  return resolver;
}
