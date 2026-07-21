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

/** Default AI Gateway model ids (single source; re-exported by chat-model-id). */
export const DEFAULT_AI_CHAT_MODEL_ID = "openai/gpt-5-mini";
/** Small / non-reasoning default kept for legacy classifier callers. */
export const DEFAULT_AI_CLASSIFIER_MODEL_ID = "openai/gpt-5-nano";
/**
 * Default for the planning & coding tier (sandboxed code execution, plan
 * authoring). Independently configurable so it never rides on the chat default,
 * because not all chat models accept the Mastra workspace tool message format.
 */
export const DEFAULT_AI_PLANNING_CODING_MODEL_ID = "openai/gpt-5-mini";
/** @deprecated Alias of {@link DEFAULT_AI_PLANNING_CODING_MODEL_ID}. */
export const DEFAULT_AI_CODE_EXECUTION_MODEL_ID =
  DEFAULT_AI_PLANNING_CODING_MODEL_ID;
/** Default safeguard model for Mastra guardrail processors. */
export const DEFAULT_AI_SAFEGUARD_MODEL_ID =
  "openrouter/openai/gpt-oss-safeguard-20b";

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
  | "default";

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

  const session = pick(options.sessionOverride);
  if (session) {
    return { purpose: options.purpose, value: session, source: "session" };
  }
  const agent = pick(options.agentOverride);
  if (agent) {
    return { purpose: options.purpose, value: agent, source: "agent" };
  }
  const tenant = pick(options.tenantDefault);
  if (tenant) {
    return { purpose: options.purpose, value: tenant, source: "tenant" };
  }
  for (const key of spec.envKeys) {
    const fromEnv = pick(read(key));
    if (fromEnv) {
      return { purpose: options.purpose, value: fromEnv, source: "platform" };
    }
  }
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
