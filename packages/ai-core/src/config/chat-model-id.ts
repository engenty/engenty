import { env } from "@engenty/telemetry";
import { type AiModelPurpose, resolvePurposeModel } from "./model-purposes.js";

/**
 * Thin back-compat facade over {@link resolvePurposeModel}.
 *
 * Precedence: `override` → `tenantDefault` → purpose-specific env → package
 * default. The unified chain lives in `model-purposes.ts`; this module keeps the
 * historical `resolveChatModelId` / `resolveSafeguardModelId` signatures so the
 * many existing callers in `apps/ai` need no change.
 *
 * `defaultReadEnv` stays inline so `@engenty/ai-core/browser` (which re-exports
 * this module) does not depend on `@engenty/telemetry`.
 */

// Re-exported so existing imports from this module keep resolving.
export {
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
  DEFAULT_AI_CODE_EXECUTION_MODEL_ID,
  DEFAULT_AI_SAFEGUARD_MODEL_ID,
} from "./model-purposes.js";

/**
 * Legacy purpose union. `code_execution` maps to the `planning_coding` tier in
 * the unified resolver; both keep the same env keys and default.
 */
export type ChatModelResolutionPurpose = "chat" | "routing" | "code_execution";

export interface ResolveChatModelIdOptions {
  /** Request-level override (e.g. copilot param, tool arg). */
  override?: string | null | undefined;
  purpose: ChatModelResolutionPurpose;
  /** Test hook; defaults to `process.env` when available. */
  readEnv?: (key: string) => string | undefined;
  /** Tenant/org default from persisted settings. */
  tenantDefault?: string | null | undefined;
}

function defaultReadEnv(key: string): string | undefined {
  return env(key);
}

function toPurpose(purpose: ChatModelResolutionPurpose): AiModelPurpose {
  return purpose === "code_execution" ? "planning_coding" : purpose;
}

export function resolveChatModelId(options: ResolveChatModelIdOptions): string {
  return resolvePurposeModel({
    purpose: toPurpose(options.purpose),
    sessionOverride: options.override,
    tenantDefault: options.tenantDefault,
    readEnv: options.readEnv ?? defaultReadEnv,
  }).value;
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
  return resolvePurposeModel({
    purpose: "safeguard",
    sessionOverride: options.override,
    tenantDefault: options.tenantDefault,
    readEnv: options.readEnv ?? defaultReadEnv,
  }).value;
}
