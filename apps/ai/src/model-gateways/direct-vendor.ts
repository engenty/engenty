/**
 * Shared shape for the two direct-vendor catalogs (OpenAI, Anthropic).
 *
 * Neither vendor's model list carries prices, context windows or capability
 * flags — it is an inventory, not a catalog. Rows are stored with the same
 * `provider/model` id the gateways use for the same weights, so a Vercel or
 * OpenRouter sync that has already priced `openai/gpt-4o` prices the direct
 * row too (`ai.model_pricing` is keyed by id alone), and a provider grant for
 * `openai` covers it either way.
 */
import { readGatewayApiKeyFromEnv } from "@engenty/ai-core";
import type { GatewayModelAvailabilityFlags } from "../gateway-models.js";
import type { ModelGatewayRecord } from "./model-gateway.js";

export const CHAT_ONLY_AVAILABILITY: GatewayModelAvailabilityFlags = {
  available_for_agent: true,
  available_for_embedding: false,
  available_for_image: false,
  available_for_realtime: false,
  available_for_rerank: false,
  available_for_classification: false,
  available_for_text: true,
  available_for_transcription: false,
  available_for_video: false,
};

/**
 * The credential, or null. A keyed catalog with no key lists nothing rather
 * than failing the sync: every install without that vendor would otherwise
 * see "Partial sync — openai: OPENAI_API_KEY not set" on every run, which is
 * not a fault, it is the default.
 */
export function vendorApiKey(gatewayId: string): string | null {
  return readGatewayApiKeyFromEnv(gatewayId);
}

export function chatOnlyRecord(input: {
  capabilities: Record<string, unknown>;
  contextTokens?: number | null;
  description?: string | null;
  displayName: string | null;
  maxOutputTokens?: number | null;
  modelId: string;
  now: Date;
  provider: string;
  raw: Record<string, unknown>;
  releasedAt: string | null;
  sourceUrl: string;
  tags: string[];
}): ModelGatewayRecord {
  return {
    ...CHAT_ONLY_AVAILABILITY,
    cached_input_per_mtok_micros: null,
    capabilities: input.capabilities,
    context_tokens: input.contextTokens ?? null,
    description: input.description ?? null,
    display_name: input.displayName,
    input_per_mtok_micros: null,
    last_seen_at: input.now.toISOString(),
    last_synced_at: input.now.toISOString(),
    max_output_tokens: input.maxOutputTokens ?? null,
    model_id: input.modelId,
    no_training_supported: null,
    output_per_mtok_micros: null,
    provider: input.provider,
    providers: [input.provider],
    raw_json: input.raw,
    regions: [],
    released_at: input.releasedAt,
    source_url: input.sourceUrl,
    tags: input.tags,
    type: "language",
    use_cases: ["text"],
    web_search_per_query_micros: null,
    zdr_supported: null,
  };
}
