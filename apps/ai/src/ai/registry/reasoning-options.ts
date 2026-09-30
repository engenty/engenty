// The reasoning level a person picked, turned into the provider options for
// whichever model an agent actually lands on. Decided at assembly, not at the
// route: a per-agent pin or an agent's own tier can put the agent on a model
// other than the one the composer named, and the knob has to match that model.

import {
  type AiReasoningEffort,
  type AiUsageStore,
  modelIdOfRef,
  parseModelRef,
  type ReasoningProviderOptions,
  reasoningProviderOptions,
  supportsReasoningEffort,
} from "@engenty/ai-core";
import type { AiGatewayModelStore } from "../../gateway-models.js";
import { CONTEXT_TOKENS_CACHE_TTL_MS } from "./history-token-budget.js";

/** Whether the catalog marks a model ref as a reasoning model. */
export type ReasoningSupportResolver = (modelRef: string) => Promise<boolean>;

type ModelCatalogReader = Pick<AiGatewayModelStore, "listGatewayModels">;

/**
 * Catalog lookup for the `reasoning` tag, cached per ref. An unknown model or a
 * failed read answers false: sending a reasoning parameter to a model that
 * does not take one fails the call, leaving it out only skips the knob.
 */
export function createReasoningSupportResolver(
  getStore: () => (AiUsageStore & Partial<ModelCatalogReader>) | null,
  options: { now?: () => number; ttlMs?: number } = {}
): ReasoningSupportResolver {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? CONTEXT_TOKENS_CACHE_TTL_MS;
  const cache = new Map<string, { at: number; value: boolean }>();
  return async (modelRef) => {
    const ref = modelRef.trim();
    if (!ref) {
      return false;
    }
    const hit = cache.get(ref);
    if (hit && now() - hit.at < ttlMs) {
      return hit.value;
    }
    const { gateway } = parseModelRef(ref);
    const modelId = modelIdOfRef(ref);
    let value = false;
    try {
      const rows = await getStore()?.listGatewayModels?.({ search: modelId });
      value = (rows ?? []).some(
        (row) =>
          row.model_id === modelId &&
          row.gateway === gateway &&
          row.tags.includes("reasoning")
      );
    } catch {
      value = false;
    }
    cache.set(ref, { at: now(), value });
    return value;
  };
}

/** Provider options for `modelRef` at `level`, or undefined for no knob. */
export async function resolveReasoningOptions(
  modelRef: string,
  level: AiReasoningEffort | null | undefined,
  isReasoningModel: ReasoningSupportResolver | undefined
): Promise<ReasoningProviderOptions | undefined> {
  if (!(level && isReasoningModel)) {
    return;
  }
  const reasoning = await isReasoningModel(modelRef);
  return supportsReasoningEffort(modelRef, reasoning)
    ? reasoningProviderOptions(modelRef, level)
    : undefined;
}
