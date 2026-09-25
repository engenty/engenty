import { MISTRAL_GATEWAY_ID } from "@engenty/ai-core";
import { chatOnlyRecord, vendorApiKey } from "./direct-vendor.js";
import type {
  ModelGateway,
  ModelGatewayListOptions,
  ModelGatewayRecord,
} from "./model-gateway.js";

export { MISTRAL_GATEWAY_ID } from "@engenty/ai-core";

export const MISTRAL_MODELS_URL = "https://api.mistral.ai/v1/models";

/** `GET /v1/models`: Mistral states capabilities per model, unlike OpenAI. */
interface MistralApiModel {
  capabilities?: {
    completion_chat?: boolean;
    function_calling?: boolean;
    vision?: boolean;
  };
  created?: number;
  deprecation?: string | null;
  description?: string | null;
  id: string;
  max_context_length?: number;
  name?: string | null;
}

interface MistralApiResponse {
  data?: MistralApiModel[];
}

export function isMistralChatModel(model: MistralApiModel): boolean {
  return model.capabilities?.completion_chat === true && !model.deprecation;
}

export function mistralTags(model: MistralApiModel): string[] {
  const tags = ["structured-outputs"];
  if (model.capabilities?.function_calling) {
    tags.push("tool-use");
  }
  if (model.capabilities?.vision) {
    tags.push("vision");
  }
  return tags;
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

export function normalizeMistralModel(
  model: MistralApiModel,
  opts: { now: Date; sourceUrl?: string } = { now: new Date() }
): ModelGatewayRecord {
  const tags = mistralTags(model);
  return chatOnlyRecord({
    capabilities: {
      tool_use: tags.includes("tool-use"),
      vision: tags.includes("vision"),
    },
    contextTokens: model.max_context_length ?? null,
    description: model.description ?? null,
    displayName: model.name ?? model.id,
    // Same `mistral/…` id the Vercel catalog uses, so its price rows apply.
    modelId: `${MISTRAL_GATEWAY_ID}/${model.id}`,
    now: opts.now,
    provider: MISTRAL_GATEWAY_ID,
    raw: model as unknown as Record<string, unknown>,
    releasedAt: unixSecondsToIso(model.created),
    sourceUrl: opts.sourceUrl ?? MISTRAL_MODELS_URL,
    tags,
  });
}

/** Mistral reached directly on `MISTRAL_API_KEY`. Chat models only. */
export const mistralGateway: ModelGateway = {
  id: MISTRAL_GATEWAY_ID,

  async listModels(
    opts: ModelGatewayListOptions
  ): Promise<ModelGatewayRecord[]> {
    const apiKey = vendorApiKey(MISTRAL_GATEWAY_ID);
    if (!apiKey) {
      return [];
    }
    const response = await (opts.fetchImpl ?? fetch)(MISTRAL_MODELS_URL, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`Mistral models fetch failed: ${response.status}`);
    }
    const payload = (await response.json()) as MistralApiResponse;
    return (payload.data ?? [])
      .filter(
        (model): model is MistralApiModel =>
          typeof model?.id === "string" && isMistralChatModel(model)
      )
      .map((model) =>
        normalizeMistralModel(model, {
          now: opts.now,
          sourceUrl: MISTRAL_MODELS_URL,
        })
      );
  },

  sourceUrl: MISTRAL_MODELS_URL,
};
