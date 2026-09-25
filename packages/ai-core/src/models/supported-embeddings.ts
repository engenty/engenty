/**
 * Supported embedding models from Vercel AI Gateway (type === "embedding").
 * Regenerate via: pnpm --filter @engenty/ai-core embedding:update
 */
import data from "../../data/supported-embedding-models.json" with {
  type: "json",
};
import {
  DEFAULT_MODEL_GATEWAY_ID,
  parseModelRef,
} from "../config/model-ref.js";

export interface SupportedEmbeddingModel {
  id: string;
  name: string;
  provider: string;
}

export interface SupportedEmbeddingModelsData {
  models: SupportedEmbeddingModel[];
}

export const supportedEmbeddingModels = data as SupportedEmbeddingModelsData;

/**
 * Width of every vector the search index stores (`search.chunks.embedding` is
 * `vector(1536)`; `RETRIEVAL_VECTOR_DIM` in `@engenty/retrieval`).
 */
export const SEARCH_INDEX_EMBEDDING_DIMENSIONS = 1536;

/**
 * Gateway embedding models that yield 1536-dim vectors: natively, or reduced to
 * 1536 by the dimension option the retrieval embedder passes (`google/*` →
 * `outputDimensionality`, `openai/text-embedding-3-large` → `dimensions`).
 * The gateway catalog carries no dimensions, so this list is curated by hand —
 * a model missing here is refused, never guessed.
 */
const INDEX_COMPATIBLE_EMBEDDING_MODEL_IDS: ReadonlySet<string> = new Set([
  "cohere/embed-v4.0",
  "google/gemini-embedding-001",
  "google/gemini-embedding-2",
  "mistral/codestral-embed",
  "openai/text-embedding-3-large",
  "openai/text-embedding-3-small",
  "openai/text-embedding-ada-002",
  "voyage/voyage-code-2",
]);

/**
 * True when the `embedding` role may be bound to this model (a bare id or a
 * model ref). Embeddings only run on the default gateway, so a ref naming any
 * other gateway is not compatible either.
 */
export function isIndexCompatibleEmbeddingModel(modelRef: string): boolean {
  const ref = parseModelRef(modelRef);
  return (
    ref.gateway === DEFAULT_MODEL_GATEWAY_ID &&
    INDEX_COMPATIBLE_EMBEDDING_MODEL_IDS.has(ref.modelId)
  );
}
