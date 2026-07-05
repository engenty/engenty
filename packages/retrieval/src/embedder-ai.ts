// AI-SDK embedder factory — the hoist of the identical `buildXxxEmbedder`
// copies in contacts / knowledge-base / inbox. One embedder per (model, dims);
// callers cache per model id (see service.ts).

import {
  defineEmbedder,
  type SearchEmbedder,
} from "@engenty/search-index";
import { embed, embedMany } from "ai";
import { RETRIEVAL_VECTOR_DIM } from "./contracts.js";

export interface CreateAiSdkEmbedderOptions {
  dimensions?: number;
  maxBatchSize?: number;
  modelId: string;
}

export function createAiSdkEmbedder(
  options: CreateAiSdkEmbedderOptions
): SearchEmbedder {
  const { modelId } = options;
  const dimensions = options.dimensions ?? RETRIEVAL_VECTOR_DIM;
  const maxBatchSize = options.maxBatchSize ?? 64;
  const lower = modelId.toLowerCase();
  // The AI SDK's `providerOptions` is typed as `Record<string, JSONObject>`
  // (no `undefined` allowed in index values). We carry the cast at the
  // declaration site and then forward it as `unknown` so the SDK's stricter
  // overload still accepts it.
  const providerOptions: Record<string, Record<string, unknown>> | undefined =
    lower.startsWith("google/")
      ? { google: { outputDimensionality: dimensions } }
      : lower === "openai/text-embedding-3-large"
        ? { openai: { dimensions } }
        : undefined;
  return defineEmbedder(
    async (texts) => {
      if (texts.length === 1) {
        const single = await embed({
          model: modelId,
          value: texts[0] ?? "",
          ...(providerOptions
            ? { providerOptions: providerOptions as never }
            : {}),
        });
        return [Array.from(single.embedding as readonly number[]) as number[]];
      }
      const result = await embedMany({
        maxParallelCalls: 4,
        model: modelId,
        values: texts,
        ...(providerOptions
          ? { providerOptions: providerOptions as never }
          : {}),
      });
      return result.embeddings.map(
        (raw) => Array.from(raw as readonly number[]) as number[]
      );
    },
    {
      batch: true,
      dimensions,
      maxBatchSize,
      modelId,
    }
  );
}
