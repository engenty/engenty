/**
 * Observational memory is a background Observer/Reflector, not the chat turn.
 * It must use the AI Gateway and a configured model — never Mastra's default
 * `google/gemini-2.5-flash`, which looks up GOOGLE_API_KEY and fails the run
 * when that key is unset.
 *
 * It resolves through the `memory` purpose — its own role, bound separately in
 * the model console. It used to share `routing` with thread titles and tool
 * search; that tier is bound to a 20B model, and on 2026-08-28 four of six
 * reflection calls came back `finishReason: "length"` with the model still
 * narrating its plan. Nothing was written back, so the observation pile grew
 * and every later call was bigger — a failure that feeds itself.
 */
import { resolveChatModelId } from "@engenty/ai-core";
import type { MastraModelConfig } from "@mastra/core/llm";
import { resolveMastraModel } from "../../model-gateways/resolve-language-model.js";

export function resolveObservationalMemoryModelId(
  modelId?: string | null
): string {
  const trimmed = modelId?.trim();
  return trimmed && trimmed.length > 0
    ? trimmed
    : resolveChatModelId({ purpose: "memory" });
}

/** Language model (or leftover non-gateway id) for Mastra ObservationalMemory. */
export function observationalMemoryLanguageModel(
  modelId?: string | null
): MastraModelConfig {
  return resolveMastraModel<MastraModelConfig>(
    resolveObservationalMemoryModelId(modelId)
  );
}
