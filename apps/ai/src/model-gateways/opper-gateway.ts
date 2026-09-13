import { OPPER_COMPAT_BASE_URL, OPPER_GATEWAY_ID } from "@engenty/ai-core";
import type {
  GatewayModelAvailabilityFlags,
  GatewayModelUseCase,
} from "../gateway-models.js";
import { vendorApiKey } from "./direct-vendor.js";
import type {
  ModelGateway,
  ModelGatewayListOptions,
  ModelGatewayRecord,
} from "./model-gateway.js";

export { OPPER_GATEWAY_ID } from "@engenty/ai-core";

export const OPPER_MODELS_URL = `${OPPER_COMPAT_BASE_URL}/models`;

/**
 * `GET /v3/compat/models`: OpenAI's `models.list` shape, extended with
 * OpenRouter-shaped per-token USD `pricing`, `context_length`, and an `opper`
 * block naming what the entry is and what it can do.
 *
 * `opper.kind` is the filter: `model` is a concrete catalog row
 * (`anthropic/claude-sonnet-4.5`); `pool` is a bare name that load-balances
 * across providers and `dynamic_route` an org's routing graph. Only concrete
 * rows are stored — a pool's bare id has no `provider/model` shape, and a
 * route reports neither capabilities nor a price.
 */
interface OpperPricing {
  completion?: string | number;
  input_cache_read?: string | number;
  prompt?: string | number;
}

interface OpperBlock {
  capabilities?: string[];
  description?: string;
  kind?: string;
  maker?: string;
  max_output_tokens?: number;
  type?: string;
}

interface OpperApiModel {
  context_length?: number;
  created?: number;
  id: string;
  opper?: OpperBlock;
  pricing?: OpperPricing;
}

interface OpperApiResponse {
  data?: OpperApiModel[];
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tokenPriceToMicrosPerMtok(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 1_000_000 * 1_000_000);
}

/** A concrete language model — not a pool, a route, or an embedding row. */
export function isOpperCatalogModel(model: OpperApiModel): boolean {
  const kind = model.opper?.kind ?? "model";
  const type = model.opper?.type ?? "llm";
  return kind === "model" && type !== "embedding" && model.id.includes("/");
}

/**
 * Opper's capability vocabulary → the platform's tag vocabulary. The
 * `tool-use` tag is what `isCapableAgentModel` reads; without the translation
 * every Opper model would vanish from the agent pickers.
 */
export function opperTags(model: OpperApiModel): string[] {
  const caps = new Set(
    (model.opper?.capabilities ?? []).map((c) => c.toLowerCase())
  );
  const tags: string[] = [];
  if (caps.has("tools") || caps.has("function_calling")) {
    tags.push("tool-use");
  }
  if (caps.has("reasoning") || caps.has("thinking")) {
    tags.push("reasoning");
  }
  if (caps.has("vision") || caps.has("image")) {
    tags.push("vision");
  }
  if (caps.has("pdf") || caps.has("file")) {
    tags.push("file-input");
  }
  if (caps.has("structured_output") || caps.has("json")) {
    tags.push("structured-outputs");
  }
  if (tokenPriceToMicrosPerMtok(model.pricing?.input_cache_read) !== null) {
    tags.push("implicit-caching");
  }
  return tags;
}

const CHAT_AVAILABILITY: GatewayModelAvailabilityFlags = {
  available_for_chat: true,
  available_for_embedding: false,
  available_for_image: false,
  available_for_rerank: false,
  available_for_routing: true,
  available_for_video: false,
};

export function normalizeOpperModel(
  model: OpperApiModel,
  opts: { now: Date; sourceUrl?: string } = { now: new Date() }
): ModelGatewayRecord {
  const provider = (
    model.opper?.maker ||
    model.id.split("/")[0] ||
    "unknown"
  ).toLowerCase();
  const tags = opperTags(model);
  const has = (tag: string) => tags.includes(tag);
  const pricing = model.pricing ?? {};
  const useCases: GatewayModelUseCase[] = ["text"];
  return {
    ...CHAT_AVAILABILITY,
    cached_input_per_mtok_micros: tokenPriceToMicrosPerMtok(
      pricing.input_cache_read
    ),
    capabilities: {
      explicit_caching: false,
      file_input: has("file-input"),
      image_generation: false,
      implicit_caching: has("implicit-caching"),
      max_output_tokens: nullableNumber(model.opper?.max_output_tokens),
      reasoning: has("reasoning"),
      tool_use: has("tool-use"),
      vision: has("vision"),
      web_search: false,
    },
    context_tokens: nullableNumber(model.context_length),
    description: model.opper?.description ?? null,
    display_name: model.id.split("/").slice(1).join("/") || model.id,
    input_per_mtok_micros: tokenPriceToMicrosPerMtok(pricing.prompt),
    last_seen_at: opts.now.toISOString(),
    last_synced_at: opts.now.toISOString(),
    max_output_tokens: nullableNumber(model.opper?.max_output_tokens),
    model_id: model.id,
    no_training_supported: null,
    output_per_mtok_micros: tokenPriceToMicrosPerMtok(pricing.completion),
    provider,
    providers: [provider],
    raw_json: model as unknown as Record<string, unknown>,
    released_at: unixSecondsToIso(model.created),
    source_url: opts.sourceUrl ?? OPPER_MODELS_URL,
    tags,
    type: "language",
    use_cases: useCases,
    web_search_per_query_micros: null,
    zdr_supported: null,
  };
}

/**
 * Opper: an OpenAI-compatible gateway. The listing is scoped to the caller's
 * key (its comply allowlist decides what is visible), so unlike OpenRouter it
 * cannot be browsed before `OPPER_API_KEY` is set.
 */
export const opperGateway: ModelGateway = {
  id: OPPER_GATEWAY_ID,

  async listModels(
    opts: ModelGatewayListOptions
  ): Promise<ModelGatewayRecord[]> {
    const apiKey = vendorApiKey(OPPER_GATEWAY_ID);
    if (!apiKey) {
      return [];
    }
    const response = await (opts.fetchImpl ?? fetch)(OPPER_MODELS_URL, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`Opper models fetch failed: ${response.status}`);
    }
    const payload = (await response.json()) as OpperApiResponse;
    return (payload.data ?? [])
      .filter(
        (model): model is OpperApiModel =>
          typeof model?.id === "string" && isOpperCatalogModel(model)
      )
      .map((model) =>
        normalizeOpperModel(model, {
          now: opts.now,
          sourceUrl: OPPER_MODELS_URL,
        })
      );
  },

  sourceUrl: OPPER_MODELS_URL,
};
