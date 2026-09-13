import { ANTHROPIC_GATEWAY_ID } from "@engenty/ai-core";
import { chatOnlyRecord, vendorApiKey } from "./direct-vendor.js";
import type {
  ModelGateway,
  ModelGatewayListOptions,
  ModelGatewayRecord,
} from "./model-gateway.js";

export { ANTHROPIC_GATEWAY_ID } from "@engenty/ai-core";

/** The page size is the API maximum; the catalog is far smaller than that. */
export const ANTHROPIC_MODELS_URL =
  "https://api.anthropic.com/v1/models?limit=1000";
export const ANTHROPIC_API_VERSION = "2023-06-01";

interface AnthropicApiModel {
  created_at?: string;
  display_name?: string;
  id: string;
  type?: string;
}

interface AnthropicApiResponse {
  data?: AnthropicApiModel[];
  has_more?: boolean;
}

/**
 * Every Claude model calls tools and reads images; extended thinking arrived
 * with 3.7 and is on every model since. The list states none of this, so the
 * generation is read off the id.
 */
export function anthropicTags(id: string): string[] {
  const tags = ["tool-use", "vision", "file-input", "structured-outputs"];
  if (!/claude-3-(5|opus|sonnet|haiku)/.test(id)) {
    tags.push("reasoning");
  }
  return tags;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function normalizeAnthropicModel(
  model: AnthropicApiModel,
  opts: { now: Date; sourceUrl?: string } = { now: new Date() }
): ModelGatewayRecord {
  const tags = anthropicTags(model.id);
  return chatOnlyRecord({
    capabilities: {
      explicit_caching: true,
      file_input: true,
      image_generation: false,
      implicit_caching: false,
      max_output_tokens: null,
      reasoning: tags.includes("reasoning"),
      tool_use: true,
      vision: true,
      web_search: false,
    },
    displayName: model.display_name ?? model.id,
    modelId: `${ANTHROPIC_GATEWAY_ID}/${model.id}`,
    now: opts.now,
    provider: ANTHROPIC_GATEWAY_ID,
    raw: model as unknown as Record<string, unknown>,
    releasedAt: isoOrNull(model.created_at),
    sourceUrl: opts.sourceUrl ?? ANTHROPIC_MODELS_URL,
    tags,
  });
}

/** Anthropic reached directly on `ANTHROPIC_API_KEY`. */
export const anthropicGateway: ModelGateway = {
  id: ANTHROPIC_GATEWAY_ID,

  async listModels(
    opts: ModelGatewayListOptions
  ): Promise<ModelGatewayRecord[]> {
    const apiKey = vendorApiKey(ANTHROPIC_GATEWAY_ID);
    if (!apiKey) {
      return [];
    }
    const response = await (opts.fetchImpl ?? fetch)(ANTHROPIC_MODELS_URL, {
      headers: {
        "anthropic-version": ANTHROPIC_API_VERSION,
        "x-api-key": apiKey,
      },
    });
    if (!response.ok) {
      throw new Error(`Anthropic models fetch failed: ${response.status}`);
    }
    const payload = (await response.json()) as AnthropicApiResponse;
    return (payload.data ?? [])
      .filter(
        (model): model is AnthropicApiModel =>
          typeof model?.id === "string" && model.type !== "deprecated"
      )
      .map((model) =>
        normalizeAnthropicModel(model, {
          now: opts.now,
          sourceUrl: ANTHROPIC_MODELS_URL,
        })
      );
  },

  sourceUrl: ANTHROPIC_MODELS_URL,
};
