/**
 * Purpose-oriented AI model resolution with provenance.
 *
 * The AI settings redesign resolves every model along one chain:
 *   session override → agent override → tenant default → platform (env) → package default
 *
 * Platform-scoped settings are hydrated into `process.env` at boot (see
 * `@engenty/platform-settings` hydrate), so the env layer already reflects
 * platform overrides — there is no separate async platform read here. Callers
 * pass a `readEnv` reader so this module stays free of `@engenty/telemetry` and
 * remains safe to import from `@engenty/ai-core/browser`.
 */

import {
  firstAllowedModelId,
  isModelAllowed,
  type ModelAllowList,
} from "../usage/model-allow-list.js";
import {
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_PLANNING_CODING_MODEL_ID,
  DEFAULT_AI_SAFEGUARD_MODEL_ID,
} from "./model-defaults.js";

export {
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
  DEFAULT_AI_CODE_EXECUTION_MODEL_ID,
  DEFAULT_AI_PLANNING_CODING_MODEL_ID,
  DEFAULT_AI_SAFEGUARD_MODEL_ID,
} from "./model-defaults.js";

import { type ModelBindings, PURPOSE_TO_ROLE } from "./model-roles.js";

/**
 * The tunable LLM purposes surfaced in the AI settings model matrix. Document
 * conversion is intentionally NOT here: it is a provider+model pair resolved
 * from `doc_converter` prefs and lives in its own settings surface.
 */
export type AiModelPurpose =
  | "chat"
  | "routing"
  | "research"
  | "planning_coding"
  | "safeguard";

/** Stable display order for the model matrix. */
export const AI_MODEL_PURPOSES: readonly AiModelPurpose[] = [
  "chat",
  "routing",
  "research",
  "planning_coding",
  "safeguard",
] as const;

/** Which layer supplied the effective value (for UI provenance badges). */
export type AiSettingSource =
  | "session"
  | "agent"
  | "tenant"
  | "platform"
  | "default"
  /** Every configured layer was outside the allow-list; a granted model was substituted. */
  | "governance";

export interface ResolvedModel {
  purpose: AiModelPurpose;
  source: AiSettingSource;
  value: string;
}

interface PurposeSpec {
  /** Package default model id (bottom of the chain). */
  defaultModelId: string;
  /** Env keys checked in order for the platform layer. */
  envKeys: readonly string[];
  /** Field in tenant `ai.config` JSON carrying this purpose's model id. */
  tenantField:
    | "chat_model_id"
    | "coordinator_model_id"
    | "research_model_id"
    | "planning_coding_model_id"
    | "safeguard_model_id";
}

/**
 * Per-purpose resolution spec. Env chains preserve the historical behavior:
 * routing falls back through coordinator → chat env keys; planning_coding keeps
 * the code-execution key and never falls back to the chat env (workspace tool
 * format compatibility). `coordinator_model_id` is the legacy stored name for
 * the routing tier.
 */
export const AI_MODEL_PURPOSE_SPECS: Record<AiModelPurpose, PurposeSpec> = {
  chat: {
    defaultModelId: DEFAULT_AI_CHAT_MODEL_ID,
    envKeys: ["AI_CHAT_MODEL"],
    tenantField: "chat_model_id",
  },
  routing: {
    defaultModelId: DEFAULT_AI_CHAT_MODEL_ID,
    envKeys: ["AI_ROUTING_MODEL", "AI_COORDINATOR_MODEL", "AI_CHAT_MODEL"],
    tenantField: "coordinator_model_id",
  },
  research: {
    defaultModelId: DEFAULT_AI_CHAT_MODEL_ID,
    envKeys: ["AI_RESEARCH_MODEL"],
    tenantField: "research_model_id",
  },
  planning_coding: {
    defaultModelId: DEFAULT_AI_PLANNING_CODING_MODEL_ID,
    envKeys: ["AI_PLANNING_MODEL", "AI_CODE_EXECUTION_MODEL"],
    tenantField: "planning_coding_model_id",
  },
  safeguard: {
    defaultModelId: DEFAULT_AI_SAFEGUARD_MODEL_ID,
    envKeys: ["AI_SAFEGUARD_MODEL"],
    tenantField: "safeguard_model_id",
  },
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
  /**
   * Platform role bindings. When supplied, the bound model IS the platform
   * layer and the env keys are not consulted — bindings are seeded from those
   * same env vars once, at boot, so there is exactly one place to look
   * afterwards. Omit to keep the pre-binding env behaviour.
   */
  bindings?: ModelBindings;
  /**
   * Dev mode: ignore the allow-list entirely so the whole catalog is testable.
   * Governance still applies in the preflight, so this is a resolution-time
   * convenience, not a way to bill an unlicensed model in production.
   */
  devMode?: boolean;
  purpose: AiModelPurpose;
  /** Env reader; server callers pass a `process.env`-backed reader. */
  readEnv?: (key: string) => string | undefined;
  /** Per-conversation user pick (highest priority). */
  sessionOverride?: string | null;
  /** Tenant `ai.config` value for this purpose. */
  tenantDefault?: string | null;
}

/** Resolve a purpose's effective model id and the layer that supplied it. */
export function resolvePurposeModel(
  options: ResolvePurposeModelOptions
): ResolvedModel {
  const spec = AI_MODEL_PURPOSE_SPECS[options.purpose];
  const read = options.readEnv ?? (() => undefined);
  const policy: ModelAllowList = {
    allowed_models: options.allowedModels ?? null,
    allowed_providers: options.allowedProviders ?? null,
  };
  const allowed = (value: string) =>
    options.devMode === true || isModelAllowed(value, policy);

  const session = pick(options.sessionOverride);
  if (session && allowed(session)) {
    return { purpose: options.purpose, value: session, source: "session" };
  }
  const agent = pick(options.agentOverride);
  if (agent && allowed(agent)) {
    return { purpose: options.purpose, value: agent, source: "agent" };
  }
  const tenant = pick(options.tenantDefault);
  if (tenant && allowed(tenant)) {
    return { purpose: options.purpose, value: tenant, source: "tenant" };
  }
  // The platform layer: a binding when the table has been populated, else the
  // env vars it will be seeded from.
  const bound = options.bindings
    ? pick(
        options.bindings.get(PURPOSE_TO_ROLE[options.purpose] ?? "")?.modelId
      )
    : undefined;
  if (bound) {
    if (allowed(bound)) {
      return { purpose: options.purpose, value: bound, source: "platform" };
    }
  } else {
    for (const key of spec.envKeys) {
      const fromEnv = pick(read(key));
      if (fromEnv && allowed(fromEnv)) {
        return { purpose: options.purpose, value: fromEnv, source: "platform" };
      }
    }
  }
  if (allowed(spec.defaultModelId)) {
    return {
      purpose: options.purpose,
      value: spec.defaultModelId,
      source: "default",
    };
  }
  // Every layer is disallowed. The platform/default layers used to be returned
  // unchecked here, which handed `checkUsageLimits` a model it then rejected —
  // every turn 429'd with `model_not_allowed` and no way out from the UI, since
  // the picker only offers granted models. Land on a granted model instead.
  const granted = firstAllowedModelId(policy);
  if (granted) {
    return { purpose: options.purpose, value: granted, source: "governance" };
  }
  // Provider-only grant excluding the default: there is no id to fall back to
  // without a catalog lookup, which this pure resolver has no access to. The
  // preflight will reject — the write boundary is responsible for refusing a
  // policy that grants no model for a required purpose.
  return {
    purpose: options.purpose,
    value: spec.defaultModelId,
    source: "default",
  };
}

/** Convenience: just the effective model id for a purpose. */
export function resolvePurposeModelId(
  options: ResolvePurposeModelOptions
): string {
  return resolvePurposeModel(options).value;
}
