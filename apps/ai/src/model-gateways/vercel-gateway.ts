import type {
  GatewayModelAvailabilityFlags,
  GatewayModelUseCase,
} from "../gateway-models.js";
import type {
  ModelGateway,
  ModelGatewayListOptions,
  ModelGatewayRecord,
} from "./model-gateway.js";

export const VERCEL_GATEWAY_ID = "vercel";

export const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

interface GatewayApiModel {
  context_window?: number;
  created?: number;
  description?: string;
  id: string;
  max_tokens?: number;
  name?: string;
  object?: string;
  owned_by?: string;
  pricing?: Record<string, unknown>;
  released?: number;
  tags?: string[];
  type?: string;
}

interface GatewayApiResponse {
  data?: GatewayApiModel[];
  object?: string;
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
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

function normalizeProvider(model: GatewayApiModel): string {
  return (model.owned_by || model.id.split("/")[0] || "unknown").toLowerCase();
}

function deriveUseCases(model: GatewayApiModel): GatewayModelUseCase[] {
  const haystack =
    `${model.id} ${model.name ?? ""} ${model.description ?? ""}`.toLowerCase();
  const useCases = new Set<GatewayModelUseCase>();
  switch (model.type) {
    case "embedding":
      useCases.add("embed");
      break;
    case "image":
      useCases.add("image");
      break;
    case "reranking":
      useCases.add("rerank");
      break;
    case "video":
      useCases.add("video");
      break;
    default:
      useCases.add("text");
      break;
  }
  if (
    model.type === "language" &&
    /\b(code|coder|coding|codestral|devstral|programming)\b/.test(haystack)
  ) {
    useCases.add("code");
  }
  return [...useCases];
}

function defaultAvailabilityForUseCases(
  useCases: GatewayModelUseCase[]
): GatewayModelAvailabilityFlags {
  return {
    available_for_chat: useCases.includes("text") || useCases.includes("code"),
    available_for_embedding: useCases.includes("embed"),
    available_for_image: useCases.includes("image"),
    available_for_rerank: useCases.includes("rerank"),
    available_for_routing:
      useCases.includes("text") || useCases.includes("code"),
    available_for_video: useCases.includes("video"),
  };
}

function buildCapabilities(model: GatewayApiModel): Record<string, unknown> {
  const tags = new Set(model.tags ?? []);
  return {
    explicit_caching: tags.has("explicit-caching"),
    file_input: tags.has("file-input"),
    image_generation: tags.has("image-generation"),
    implicit_caching: tags.has("implicit-caching"),
    max_output_tokens: nullableNumber(model.max_tokens),
    reasoning: tags.has("reasoning"),
    tool_use: tags.has("tool-use"),
    vision: tags.has("vision"),
    web_search: tags.has("web-search"),
  };
}

export function normalizeGatewayModel(
  model: GatewayApiModel,
  opts: { now: Date; sourceUrl?: string } = { now: new Date() }
): ModelGatewayRecord {
  const provider = normalizeProvider(model);
  const pricing = model.pricing ?? {};
  const tags = model.tags ?? [];
  const useCases = deriveUseCases(model);
  return {
    ...defaultAvailabilityForUseCases(useCases),
    cached_input_per_mtok_micros: tokenPriceToMicrosPerMtok(
      pricing.input_cache_read
    ),
    capabilities: buildCapabilities(model),
    context_tokens: nullableNumber(model.context_window),
    description: model.description ?? null,
    display_name: model.name ?? null,
    input_per_mtok_micros: tokenPriceToMicrosPerMtok(pricing.input),
    last_seen_at: opts.now.toISOString(),
    last_synced_at: opts.now.toISOString(),
    max_output_tokens: nullableNumber(model.max_tokens),
    model_id: model.id,
    no_training_supported: null,
    output_per_mtok_micros: tokenPriceToMicrosPerMtok(pricing.output),
    provider,
    providers: [provider],
    raw_json: model as unknown as Record<string, unknown>,
    released_at: unixSecondsToIso(model.released),
    source_url: opts.sourceUrl ?? GATEWAY_MODELS_URL,
    tags,
    type: model.type ?? null,
    use_cases: useCases,
    web_search_per_query_micros: tokenPriceToMicrosPerMtok(pricing.web_search),
    zdr_supported: null,
  };
}

/** The Vercel AI Gateway: the catalog every model was served from until now. */
export const vercelGateway: ModelGateway = {
  id: VERCEL_GATEWAY_ID,

  async listModels(
    opts: ModelGatewayListOptions
  ): Promise<ModelGatewayRecord[]> {
    const response = await (opts.fetchImpl ?? fetch)(GATEWAY_MODELS_URL);
    if (!response.ok) {
      throw new Error(`Gateway models fetch failed: ${response.status}`);
    }
    const payload = (await response.json()) as GatewayApiResponse;
    return (payload.data ?? [])
      .filter((model): model is GatewayApiModel => typeof model.id === "string")
      .map((model) =>
        normalizeGatewayModel(model, {
          now: opts.now,
          sourceUrl: GATEWAY_MODELS_URL,
        })
      );
  },

  sourceUrl: GATEWAY_MODELS_URL,
};
