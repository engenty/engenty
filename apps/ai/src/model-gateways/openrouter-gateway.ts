import { OPENROUTER_GATEWAY_ID } from "@engenty/ai-core";
import type {
  GatewayModelAvailabilityFlags,
  GatewayModelUseCase,
} from "../gateway-models.js";
import type {
  ModelGateway,
  ModelGatewayListOptions,
  ModelGatewayRecord,
} from "./model-gateway.js";

export { OPENROUTER_GATEWAY_ID } from "@engenty/ai-core";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/**
 * OpenRouter's catalog shape. It agrees with Vercel's on the one thing that
 * matters — ids are `provider/model` — and on nothing else: capabilities are a
 * `supported_parameters` list rather than tags, modalities are arrays rather
 * than a `type` enum, and prices are per-token USD under different key names.
 */
interface OpenRouterArchitecture {
  input_modalities?: string[];
  modality?: string;
  output_modalities?: string[];
  tokenizer?: string;
}

interface OpenRouterPricing {
  completion?: string;
  image?: string;
  input_cache_read?: string;
  internal_reasoning?: string;
  prompt?: string;
  request?: string;
  web_search?: string;
}

interface OpenRouterTopProvider {
  context_length?: number;
  is_moderated?: boolean;
  max_completion_tokens?: number;
}

interface OpenRouterApiModel {
  architecture?: OpenRouterArchitecture;
  canonical_slug?: string;
  context_length?: number;
  created?: number;
  description?: string;
  id: string;
  name?: string;
  pricing?: OpenRouterPricing;
  supported_parameters?: string[];
  top_provider?: OpenRouterTopProvider;
}

interface OpenRouterApiResponse {
  data?: OpenRouterApiModel[];
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

/**
 * OpenRouter quotes per-token USD as a decimal string, same as Vercel. A
 * negative price means "variable, ask at request time" (the auto-router does
 * this) and is stored as unknown rather than as a number that would under-bill.
 */
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

/** Per-REQUEST USD → micros. Not a token price: no per-Mtok scaling. */
function requestPriceToMicros(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 1_000_000);
}

function providerOf(model: OpenRouterApiModel): string {
  return (model.id.split("/")[0] || "unknown").toLowerCase();
}

/**
 * OpenRouter names a model `"OpenAI: GPT-4o"`. The vendor half is already the
 * `provider` column and repeating it makes every picker row start with the same
 * word, so it is dropped — `display_name` is what sits next to the id in the UI.
 */
function displayNameOf(model: OpenRouterApiModel): string | null {
  const name = model.name?.trim();
  if (!name) {
    return null;
  }
  const colon = name.indexOf(":");
  if (colon > 0) {
    const tail = name.slice(colon + 1).trim();
    if (tail) {
      return tail;
    }
  }
  return name;
}

function outputModalities(model: OpenRouterApiModel): Set<string> {
  const declared = model.architecture?.output_modalities;
  if (declared && declared.length > 0) {
    return new Set(declared.map((m) => m.toLowerCase()));
  }
  // Older rows only carry `modality` as `"text+image->text"`.
  const arrow = model.architecture?.modality?.split("->")[1];
  return new Set(
    (arrow ?? "text").split("+").map((m) => m.trim().toLowerCase())
  );
}

function inputModalities(model: OpenRouterApiModel): Set<string> {
  const declared = model.architecture?.input_modalities;
  if (declared && declared.length > 0) {
    return new Set(declared.map((m) => m.toLowerCase()));
  }
  const head = model.architecture?.modality?.split("->")[0];
  return new Set(
    (head ?? "text").split("+").map((m) => m.trim().toLowerCase())
  );
}

function deriveUseCases(model: OpenRouterApiModel): GatewayModelUseCase[] {
  const outputs = outputModalities(model);
  const useCases = new Set<GatewayModelUseCase>();
  if (outputs.has("image")) {
    useCases.add("image");
  }
  if (outputs.has("text") || useCases.size === 0) {
    useCases.add("text");
  }
  const haystack =
    `${model.id} ${model.name ?? ""} ${model.description ?? ""}`.toLowerCase();
  if (
    useCases.has("text") &&
    /\b(code|coder|coding|codestral|devstral|programming)\b/.test(haystack)
  ) {
    useCases.add("code");
  }
  return [...useCases];
}

function defaultAvailabilityForUseCases(
  useCases: GatewayModelUseCase[]
): GatewayModelAvailabilityFlags {
  const conversational = useCases.includes("text") || useCases.includes("code");
  return {
    available_for_chat: conversational,
    available_for_embedding: false,
    available_for_image: useCases.includes("image"),
    available_for_rerank: false,
    available_for_routing: conversational,
    available_for_video: false,
  };
}

/**
 * Translate OpenRouter's capability signals into the tag vocabulary the rest of
 * the product already reads.
 *
 * This is the load-bearing part of the adapter. `isCapableAgentModel` and the
 * model-options route both ask `tags.includes("tool-use")` — a Vercel spelling —
 * so an adapter that passed OpenRouter's `supported_parameters` through
 * untranslated would leave every OpenRouter model looking incapable of tool
 * calling and hide it from every agent picker.
 */
export function openRouterTags(model: OpenRouterApiModel): string[] {
  const params = new Set(
    (model.supported_parameters ?? []).map((p) => p.toLowerCase())
  );
  const inputs = inputModalities(model);
  const outputs = outputModalities(model);
  const tags: string[] = [];
  if (params.has("tools") || params.has("tool_choice")) {
    tags.push("tool-use");
  }
  if (params.has("reasoning") || params.has("include_reasoning")) {
    tags.push("reasoning");
  }
  if (inputs.has("image")) {
    tags.push("vision");
  }
  if (inputs.has("file")) {
    tags.push("file-input");
  }
  if (outputs.has("image")) {
    tags.push("image-generation");
  }
  if (params.has("structured_outputs") || params.has("response_format")) {
    tags.push("structured-outputs");
  }
  if (requestPriceToMicros(model.pricing?.web_search) !== null) {
    tags.push("web-search");
  }
  // Prompt caching is a per-model property OpenRouter reports only through the
  // presence of a cache-read price, not as a capability flag.
  if (tokenPriceToMicrosPerMtok(model.pricing?.input_cache_read) !== null) {
    tags.push("implicit-caching");
  }
  return tags;
}

function buildCapabilities(
  model: OpenRouterApiModel,
  tags: readonly string[]
): Record<string, unknown> {
  const has = (tag: string) => tags.includes(tag);
  return {
    explicit_caching: false,
    file_input: has("file-input"),
    image_generation: has("image-generation"),
    implicit_caching: has("implicit-caching"),
    max_output_tokens: nullableNumber(
      model.top_provider?.max_completion_tokens
    ),
    reasoning: has("reasoning"),
    tool_use: has("tool-use"),
    vision: has("vision"),
    web_search: has("web-search"),
  };
}

export function normalizeOpenRouterModel(
  model: OpenRouterApiModel,
  opts: { now: Date; sourceUrl?: string } = { now: new Date() }
): ModelGatewayRecord {
  const provider = providerOf(model);
  const pricing = model.pricing ?? {};
  const useCases = deriveUseCases(model);
  const tags = openRouterTags(model);
  const outputs = outputModalities(model);
  return {
    ...defaultAvailabilityForUseCases(useCases),
    cached_input_per_mtok_micros: tokenPriceToMicrosPerMtok(
      pricing.input_cache_read
    ),
    capabilities: buildCapabilities(model, tags),
    context_tokens:
      nullableNumber(model.context_length) ??
      nullableNumber(model.top_provider?.context_length),
    description: model.description ?? null,
    display_name: displayNameOf(model),
    input_per_mtok_micros: tokenPriceToMicrosPerMtok(pricing.prompt),
    last_seen_at: opts.now.toISOString(),
    last_synced_at: opts.now.toISOString(),
    max_output_tokens: nullableNumber(
      model.top_provider?.max_completion_tokens
    ),
    model_id: model.id,
    // OpenRouter states neither of these per model.
    no_training_supported: null,
    output_per_mtok_micros: tokenPriceToMicrosPerMtok(pricing.completion),
    provider,
    providers: [provider],
    raw_json: model as unknown as Record<string, unknown>,
    released_at: unixSecondsToIso(model.created),
    source_url: opts.sourceUrl ?? OPENROUTER_MODELS_URL,
    tags,
    type: outputs.has("image") && !outputs.has("text") ? "image" : "language",
    use_cases: useCases,
    web_search_per_query_micros: requestPriceToMicros(pricing.web_search),
    zdr_supported: null,
  };
}

/**
 * OpenRouter: a second catalog, reached the same way as the first.
 *
 * The listing endpoint needs no credential — a deployment can browse and bind
 * OpenRouter models before `OPENROUTER_API_KEY` is set, and only the first run
 * fails. That is deliberate: a catalog that is empty until a key exists gives an
 * operator nothing to look at while deciding whether to get one.
 */
export const openRouterGateway: ModelGateway = {
  id: OPENROUTER_GATEWAY_ID,

  async listModels(
    opts: ModelGatewayListOptions
  ): Promise<ModelGatewayRecord[]> {
    const response = await (opts.fetchImpl ?? fetch)(OPENROUTER_MODELS_URL);
    if (!response.ok) {
      throw new Error(`OpenRouter models fetch failed: ${response.status}`);
    }
    const payload = (await response.json()) as OpenRouterApiResponse;
    return (payload.data ?? [])
      .filter(
        (model): model is OpenRouterApiModel => typeof model?.id === "string"
      )
      .map((model) =>
        normalizeOpenRouterModel(model, {
          now: opts.now,
          sourceUrl: OPENROUTER_MODELS_URL,
        })
      );
  },

  sourceUrl: OPENROUTER_MODELS_URL,
};
