import { OPENAI_GATEWAY_ID } from "@engenty/ai-core";
import { chatOnlyRecord, vendorApiKey } from "./direct-vendor.js";
import type {
  ModelGateway,
  ModelGatewayListOptions,
  ModelGatewayRecord,
} from "./model-gateway.js";

export { OPENAI_GATEWAY_ID } from "@engenty/ai-core";

export const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

/** `GET /v1/models`: id, owner and a creation stamp — nothing else. */
interface OpenAiApiModel {
  created?: number;
  id: string;
  object?: string;
  owned_by?: string;
}

interface OpenAiApiResponse {
  data?: OpenAiApiModel[];
}

/**
 * The list is every model the key can name, most of which are not chat
 * models: embeddings, TTS, transcription, image generation, moderation,
 * realtime and the dated snapshots of each. A chat-only gateway keeps the
 * conversational families and drops everything that would fail a `chat` call.
 */
const CHAT_FAMILY = /^(gpt-|o\d|chatgpt-)/;
const NOT_CHAT =
  /(embedding|tts|transcribe|whisper|realtime|audio|image|dall-e|moderation|instruct|search|similarity|edit|davinci|babbage|curie|ada)/;
/** Dated snapshots (`gpt-4o-2024-08-06`) duplicate their alias row. */
const DATED_SNAPSHOT = /-\d{4}-\d{2}-\d{2}$|-\d{4}$/;

export function isOpenAiChatModel(id: string): boolean {
  return CHAT_FAMILY.test(id) && !NOT_CHAT.test(id) && !DATED_SNAPSHOT.test(id);
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

/**
 * The inventory states no capabilities, so the tags come from the id. Every
 * current chat family calls tools; the reasoning families are the `o` series
 * and GPT-5; vision arrived with GPT-4o and is on everything since.
 */
export function openAiTags(id: string): string[] {
  const tags = ["tool-use", "structured-outputs"];
  if (/^(o\d|gpt-5)/.test(id)) {
    tags.push("reasoning");
  }
  if (/^(gpt-4o|gpt-4\.|gpt-5|o\d|chatgpt-)/.test(id)) {
    tags.push("vision", "file-input");
  }
  return tags;
}

export function normalizeOpenAiModel(
  model: OpenAiApiModel,
  opts: { now: Date; sourceUrl?: string } = { now: new Date() }
): ModelGatewayRecord {
  const tags = openAiTags(model.id);
  return chatOnlyRecord({
    capabilities: {
      explicit_caching: false,
      file_input: tags.includes("file-input"),
      image_generation: false,
      implicit_caching: true,
      max_output_tokens: null,
      reasoning: tags.includes("reasoning"),
      tool_use: true,
      vision: tags.includes("vision"),
      web_search: false,
    },
    displayName: model.id,
    modelId: `${OPENAI_GATEWAY_ID}/${model.id}`,
    now: opts.now,
    provider: OPENAI_GATEWAY_ID,
    raw: model as unknown as Record<string, unknown>,
    releasedAt: unixSecondsToIso(model.created),
    sourceUrl: opts.sourceUrl ?? OPENAI_MODELS_URL,
    tags,
  });
}

/** OpenAI reached directly on `OPENAI_API_KEY`. Chat models only. */
export const openAiGateway: ModelGateway = {
  id: OPENAI_GATEWAY_ID,

  async listModels(
    opts: ModelGatewayListOptions
  ): Promise<ModelGatewayRecord[]> {
    const apiKey = vendorApiKey(OPENAI_GATEWAY_ID);
    if (!apiKey) {
      return [];
    }
    const response = await (opts.fetchImpl ?? fetch)(OPENAI_MODELS_URL, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`OpenAI models fetch failed: ${response.status}`);
    }
    const payload = (await response.json()) as OpenAiApiResponse;
    return (payload.data ?? [])
      .filter(
        (model): model is OpenAiApiModel =>
          typeof model?.id === "string" && isOpenAiChatModel(model.id)
      )
      .map((model) =>
        normalizeOpenAiModel(model, {
          now: opts.now,
          sourceUrl: OPENAI_MODELS_URL,
        })
      );
  },

  sourceUrl: OPENAI_MODELS_URL,
};
