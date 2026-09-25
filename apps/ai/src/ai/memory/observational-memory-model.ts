/**
 * Observational memory is a background Observer/Reflector, not the chat turn.
 * It must use the AI Gateway and a configured model — never Mastra's default
 * `google/gemini-2.5-flash`, which looks up GOOGLE_API_KEY and fails the run
 * when that key is unset.
 *
 * It resolves through the `fast_text` purpose — short text without tools. The
 * model bound there needs a large context window and enough output budget for
 * a full reflection: on 2026-08-28 a 20B router model returned four of six
 * reflection calls with `finishReason: "length"` while still narrating its
 * plan. Nothing was written back, so the observation pile grew and every later
 * call was bigger — a failure that feeds itself.
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
    : resolveChatModelId({ purpose: "fast_text" });
}

/** Language model (or leftover non-gateway id) for Mastra ObservationalMemory. */
export function observationalMemoryLanguageModel(
  modelId?: string | null
): MastraModelConfig {
  return resolveMastraModel<MastraModelConfig>(
    resolveObservationalMemoryModelId(modelId)
  );
}
