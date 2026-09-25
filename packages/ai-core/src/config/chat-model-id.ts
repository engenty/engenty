import { type AiModelPurpose, resolvePurposeModel } from "./model-purposes.js";
import type { ModelBindings } from "./model-roles.js";

/**
 * Thin back-compat facade over {@link resolvePurposeModel}.
 *
 * Precedence: `override` → `tenantDefault` → role binding. The unified chain
 * lives in `model-purposes.ts`; this module keeps the `resolveChatModelId`
 * signature for text-producing callers.
 */

/**
 * Purposes that produce text. `classifier` is not one: its model answers
 * choice questions through the classifier client, never `generateText`.
 */
export type ChatModelResolutionPurpose = Exclude<AiModelPurpose, "classifier">;

export interface ResolveChatModelIdOptions {
  /** Governance allow-list; see {@link resolvePurposeModel}. */
  allowedModels?: readonly string[] | null;
  /** Governance provider allow-list; see {@link resolvePurposeModel}. */
  allowedProviders?: readonly string[] | null;
  /** Platform role bindings; see {@link resolvePurposeModel}. */
  bindings?: ModelBindings;
  /** Dev mode: skip the allow-list at resolution time. */
  devMode?: boolean;
  /** Request-level override (e.g. copilot param, tool arg). */
  override?: string | null | undefined;
  purpose: ChatModelResolutionPurpose;
  /** Tenant/org default from persisted settings. */
  tenantDefault?: string | null | undefined;
}

export function resolveChatModelId(options: ResolveChatModelIdOptions): string {
  return resolvePurposeModel({
    allowedModels: options.allowedModels ?? null,
    allowedProviders: options.allowedProviders ?? null,
    ...(options.bindings ? { bindings: options.bindings } : {}),
    ...(options.devMode === undefined ? {} : { devMode: options.devMode }),
    purpose: options.purpose,
    sessionOverride: options.override,
    tenantDefault: options.tenantDefault,
  }).value;
}
