import { env } from "@engenty/telemetry";

/**
 * Single source for AI Gateway model id defaults and resolution order.
 *
 * Precedence: `override` → `tenantDefault` → purpose-specific env → package default.
 * Pass `tenantDefault` from tenant settings when available; pass `override` for per-chat UI.
 *
 * Note: `defaultReadEnv` stays inline so `@engenty/ai-core/browser` (which re-exports this module)
 * does not depend on `@engenty/telemetry`. For server code, prefer {@link env}
 * from `@engenty/telemetry` where appropriate.
 */
export const DEFAULT_AI_CHAT_MODEL_ID = "openai/gpt-5-mini";

/** Default for one-shot classification when tenant/env unset. */
export const DEFAULT_AI_CLASSIFIER_MODEL_ID = "openai/gpt-5-nano";

/**
 * Default model for sandboxed code execution agents (e.g. engenty.cli).
 * Independently configurable from the main chat model via AI_CODE_EXECUTION_MODEL.
 */
export const DEFAULT_AI_CODE_EXECUTION_MODEL_ID = "openai/gpt-5-mini";

/** Default safeguard model for Mastra guardrail processors when tenant/env unset. */
export const DEFAULT_AI_SAFEGUARD_MODEL_ID =
  "openrouter/openai/gpt-oss-safeguard-20b";

export type ChatModelResolutionPurpose = "chat" | "routing" | "code_execution";

export interface ResolveChatModelIdOptions {
  /** Request-level override (e.g. copilot param, tool arg). */
  override?: string | null | undefined;
  purpose: ChatModelResolutionPurpose;
  /** Test hook; defaults to `process.env` when available. */
  readEnv?: (key: string) => string | undefined;
  /** Tenant/org default from persisted settings (future: always pass when loaded). */
  tenantDefault?: string | null | undefined;
}

function defaultReadEnv(key: string): string | undefined {
  return env(key);
}

function pick(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export function resolveChatModelId(options: ResolveChatModelIdOptions): string {
  const read = options.readEnv ?? defaultReadEnv;
  const prefix: Array<string | undefined> = [
    pick(options.override),
    pick(options.tenantDefault),
  ];
  if (options.purpose === "routing") {
    const candidates = [
      ...prefix,
      read("AI_ROUTING_MODEL"),
      read("AI_COORDINATOR_MODEL"),
      read("AI_CHAT_MODEL"),
    ];
    for (const id of candidates) {
      if (id) {
        return id;
      }
    }
    return DEFAULT_AI_CHAT_MODEL_ID;
  }
  if (options.purpose === "code_execution") {
    // Code execution agents use AI_CODE_EXECUTION_MODEL exclusively — they do
    // NOT fall back to AI_CHAT_MODEL because not all chat models support the
    // Mastra workspace tool message format (e.g. minimax rejects it with a 400).
    // Always falls back to openai/gpt-5-mini which reliably handles workspace tools.
    const candidates = [...prefix, read("AI_CODE_EXECUTION_MODEL")];
    for (const id of candidates) {
      if (id) {
        return id;
      }
    }
    return DEFAULT_AI_CODE_EXECUTION_MODEL_ID;
  }
  // chat (default)
  const candidates = [...prefix, read("AI_CHAT_MODEL")];
  for (const id of candidates) {
    if (id) {
      return id;
    }
  }
  return DEFAULT_AI_CHAT_MODEL_ID;
}

export interface ResolveSafeguardModelIdOptions {
  override?: string | null | undefined;
  readEnv?: (key: string) => string | undefined;
  tenantDefault?: string | null | undefined;
}

// Safeguard models classify input/output for Mastra guardrail processors.
// Precedence: override → tenant default → AI_SAFEGUARD_MODEL env → package default.
export function resolveSafeguardModelId(
  options: ResolveSafeguardModelIdOptions = {}
): string {
  const read = options.readEnv ?? defaultReadEnv;
  const candidates: Array<string | undefined> = [
    pick(options.override),
    pick(options.tenantDefault),
    read("AI_SAFEGUARD_MODEL"),
  ];
  for (const id of candidates) {
    if (id) {
      return id;
    }
  }
  return DEFAULT_AI_SAFEGUARD_MODEL_ID;
}
