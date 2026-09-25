import { SPACEXAI_GATEWAY_ID } from "@engenty/ai-core";
import { chatOnlyRecord, vendorApiKey } from "./direct-vendor.js";
import type {
  ModelGateway,
  ModelGatewayListOptions,
  ModelGatewayRecord,
} from "./model-gateway.js";

export { SPACEXAI_GATEWAY_ID } from "@engenty/ai-core";

export const SPACEXAI_MODELS_URL = "https://api.x.ai/v1/models";

/** `GET /v1/models`: id, owner and a creation stamp — like OpenAI's list. */
interface SpaceXAiApiModel {
  created?: number;
  id: string;
  owned_by?: string;
}

interface SpaceXAiApiResponse {
  data?: SpaceXAiApiModel[];
}

/** Grok chat models; the image and video families fail a `chat` call. */
export function isSpaceXAiChatModel(id: string): boolean {
  return /^grok-/.test(id) && !/(image|imagine|video)/.test(id);
}

/** The list states no capabilities, so tags come from the id. */
export function spaceXAiTags(id: string): string[] {
  const tags = ["tool-use", "structured-outputs"];
  if (/^grok-(3-mini|[4-9])/.test(id)) {
    tags.push("reasoning");
  }
  if (/^grok-[4-9]|vision/.test(id)) {
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

export function normalizeSpaceXAiModel(
  model: SpaceXAiApiModel,
  opts: { now: Date; sourceUrl?: string } = { now: new Date() }
): ModelGatewayRecord {
  const tags = spaceXAiTags(model.id);
  return chatOnlyRecord({
    capabilities: {
      reasoning: tags.includes("reasoning"),
      tool_use: true,
      vision: tags.includes("vision"),
    },
    displayName: model.id,
    // Same `spacexai/…` id the Vercel catalog uses, so its price rows apply.
    modelId: `${SPACEXAI_GATEWAY_ID}/${model.id}`,
    now: opts.now,
    provider: SPACEXAI_GATEWAY_ID,
    raw: model as unknown as Record<string, unknown>,
    releasedAt: unixSecondsToIso(model.created),
    sourceUrl: opts.sourceUrl ?? SPACEXAI_MODELS_URL,
    tags,
  });
}

/** SpaceX AI (Grok) reached directly on `XAI_API_KEY`. Chat models only. */
export const spaceXAiGateway: ModelGateway = {
  id: SPACEXAI_GATEWAY_ID,

  async listModels(
    opts: ModelGatewayListOptions
  ): Promise<ModelGatewayRecord[]> {
    const apiKey = vendorApiKey(SPACEXAI_GATEWAY_ID);
    if (!apiKey) {
      return [];
    }
    const response = await (opts.fetchImpl ?? fetch)(SPACEXAI_MODELS_URL, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`SpaceX AI models fetch failed: ${response.status}`);
    }
    const payload = (await response.json()) as SpaceXAiApiResponse;
    return (payload.data ?? [])
      .filter(
        (model): model is SpaceXAiApiModel =>
          typeof model?.id === "string" && isSpaceXAiChatModel(model.id)
      )
      .map((model) =>
        normalizeSpaceXAiModel(model, {
          now: opts.now,
          sourceUrl: SPACEXAI_MODELS_URL,
        })
      );
  },

  sourceUrl: SPACEXAI_MODELS_URL,
};
