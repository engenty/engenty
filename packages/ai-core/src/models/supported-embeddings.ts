/**
 * Supported embedding models from Vercel AI Gateway (type === "embedding").
 * Regenerate via: pnpm --filter @engenty/ai-core embedding:update
 */
import data from "../../data/supported-embedding-models.json" with {
  type: "json",
};

export interface SupportedEmbeddingModel {
  id: string;
  name: string;
  provider: string;
}

export interface SupportedEmbeddingModelsData {
  models: SupportedEmbeddingModel[];
}

export const supportedEmbeddingModels = data as SupportedEmbeddingModelsData;
