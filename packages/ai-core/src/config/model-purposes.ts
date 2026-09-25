/**
 * Purpose-oriented AI model resolution with provenance.
 *
 * Every model resolves along one chain:
 *   session override → agent override → tenant default → platform binding
 *
 * The platform layer is the role binding (`ai.model_binding`), read from the
 * caller's `bindings` or the process snapshot (`platform-bindings-snapshot`).
 * There is no env layer and no package default: an unbound role throws.
 * Browser-safe.
 */

import {
  firstAllowedModelId,
  isModelAllowed,
  type ModelAllowList,
} from "../usage/model-allow-list.js";
import { formatModelRef, parseModelRef } from "./model-ref.js";
import { type ModelBindings, PURPOSE_TO_ROLE } from "./model-roles.js";
import { requirePlatformBinding } from "./platform-bindings-snapshot.js";

/**
 * The tunable LLM purposes surfaced in the AI settings model matrix. Document
 * conversion is intentionally NOT here: it is a provider+model pair resolved
 * from `doc_converter` prefs and lives in its own settings surface.
 */
export type AiModelPurpose = "chat" | "classifier" | "fast_text";

/** Stable display order for the model matrix. */
export const AI_MODEL_PURPOSES: readonly AiModelPurpose[] = [
  "chat",
  "classifier",
  "fast_text",
] as const;

/** Which layer supplied the effective value (for UI provenance badges). */
export type AiSettingSource =
  | "session"
  | "agent"
  | "tenant"
  | "platform"
  /** Every configured layer was outside the allow-list; a granted model was substituted. */
  | "governance";

export interface ResolvedModel {
  /**
   * Which gateway serves {@link value}. Redundant with the ref head on `value`
   * and kept anyway: a caller that already has the pair should not have to
   * re-parse to display it, and provenance UI shows gateway and model in
   * separate columns.
   */
  gateway: string;
  purpose: AiModelPurpose;
  source: AiSettingSource;
  /**
   * A model **ref** — the bare id for the default gateway, `gateway:id`
   * otherwise. Anything that means "which model" rather than "which model,
   * where" must put this through `modelIdOfRef` first.
   */
  value: string;
}

/** Field in tenant `ai.config` JSON carrying each purpose's model id. */
export const AI_MODEL_PURPOSE_TENANT_FIELDS: Record<
  AiModelPurpose,
  "chat_model_id" | "classifier_model_id" | "fast_text_model_id"
> = {
  chat: "chat_model_id",
  classifier: "classifier_model_id",
  fast_text: "fast_text_model_id",
};

function pick(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface ResolvePurposeModelOptions {
  /** Per-agent pinned model. */
  agentOverride?: string | null;
  /**
   * Governance allow-list (usage policy `allowed_models`). Session/agent/tenant
   * pins outside the list are SKIPPED so resolution degrades to the
   * operator-controlled platform/default layers instead of hard-failing — a
   * plan tightening must not break existing tenants. Empty/null = no
   * restriction.
   */
  allowedModels?: readonly string[] | null;
  /** Governance provider allow-list (usage policy `allowed_providers`). */
  allowedProviders?: readonly string[] | null;
  /** Platform role bindings; omit to use the process snapshot. */
  bindings?: ModelBindings;
  /**
   * Dev mode: ignore the allow-list entirely so the whole catalog is testable.
   * Governance still applies in the preflight, so this is a resolution-time
   * convenience, not a way to bill an unlicensed model in production.
   */
  devMode?: boolean;
  purpose: AiModelPurpose;
  /** Per-conversation user pick (highest priority). */
  sessionOverride?: string | null;
  /** Tenant `ai.config` value for this purpose. */
  tenantDefault?: string | null;
}

/** Resolve a purpose's effective model id and the layer that supplied it. */
export function resolvePurposeModel(
  options: ResolvePurposeModelOptions
): ResolvedModel {
  const policy: ModelAllowList = {
    allowed_models: options.allowedModels ?? null,
    allowed_providers: options.allowedProviders ?? null,
  };
  const allowed = (value: string) =>
    options.devMode === true || isModelAllowed(value, policy);

  // Every layer stores ONE string, which may carry a gateway head. Resolving
  // through refs rather than a parallel gateway field is what keeps a tenant
  // pin, an agent pin and an env seed able to name a gateway without six
  // schema changes — see `model-ref.ts`.
  const resolved = (value: string, source: AiSettingSource): ResolvedModel => {
    const ref = parseModelRef(value);
    return {
      gateway: ref.gateway,
      purpose: options.purpose,
      source,
      value: formatModelRef(ref),
    };
  };

  const session = pick(options.sessionOverride);
  if (session && allowed(session)) {
    return resolved(session, "session");
  }
  const agent = pick(options.agentOverride);
  if (agent && allowed(agent)) {
    return resolved(agent, "agent");
  }
  const tenant = pick(options.tenantDefault);
  if (tenant && allowed(tenant)) {
    return resolved(tenant, "tenant");
  }
  // The platform layer: the role binding. It holds the gateway in its own
  // column, so it is recombined into a ref rather than parsed out of the id.
  const binding = requirePlatformBinding(
    PURPOSE_TO_ROLE[options.purpose] ?? options.purpose,
    options.bindings
  );
  const bound = formatModelRef({
    gateway: binding.gateway,
    modelId: binding.modelId,
  });
  if (allowed(bound)) {
    return resolved(bound, "platform");
  }
  // Every layer is disallowed. Returning the binding unchecked would hand
  // `checkUsageLimits` a model it then rejects — every turn 429'd with
  // `model_not_allowed` and no way out from the UI. Land on a granted model.
  const granted = firstAllowedModelId(policy);
  if (granted) {
    return resolved(granted, "governance");
  }
  // Provider-only grant excluding the binding: no id to substitute without a
  // catalog lookup. The preflight rejects; the policy write boundary must not
  // grant zero models for a required purpose.
  return resolved(bound, "platform");
}

/** Convenience: just the effective model id for a purpose. */
export function resolvePurposeModelId(
  options: ResolvePurposeModelOptions
): string {
  return resolvePurposeModel(options).value;
}
