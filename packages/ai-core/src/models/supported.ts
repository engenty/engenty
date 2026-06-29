/**
 * Supported LLM models from Vercel AI Gateway.
 * Regenerate via: pnpm run provider:update
 */
import data from "../../data/supported-models.json" with { type: "json" };

export interface SupportedModel {
  context_length: number | null;
  id: string;
  provider: string;
}

export interface SupportedModelsData {
  models: SupportedModel[];
}

export const supportedModels = data as SupportedModelsData;
