import type { ModelPricingRecord } from "@engenty/ai-core";

export const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

export const GATEWAY_MODEL_USE_CASES = [
  "text",
  "code",
  "image",
  "video",
  "embed",
  "rerank",
] as const;

export type GatewayModelUseCase = (typeof GATEWAY_MODEL_USE_CASES)[number];

export const GATEWAY_MODEL_PRICE_TIERS = [
  "cheap",
  "low",
  "medium",
  "high",
  "expensive",
] as const;

export type GatewayModelPriceTier = (typeof GATEWAY_MODEL_PRICE_TIERS)[number];

export const GATEWAY_MODEL_AVAILABILITY_PURPOSES = [
  "chat",
  "routing",
  "embedding",
  "image",
  "video",
  "rerank",
] as const;

export type GatewayModelAvailabilityPurpose =
  (typeof GATEWAY_MODEL_AVAILABILITY_PURPOSES)[number];

export interface GatewayModelAvailabilityFlags {
  available_for_chat: boolean;
  available_for_embedding: boolean;
  available_for_image: boolean;
  available_for_rerank: boolean;
  available_for_routing: boolean;
  available_for_video: boolean;
}

export interface GatewayModelRecord {
  available_for_chat: boolean;
  available_for_embedding: boolean;
  available_for_image: boolean;
  available_for_rerank: boolean;
  available_for_routing: boolean;
  available_for_video: boolean;
  cached_input_per_mtok_micros: number | null;
  capabilities: Record<string, unknown>;
  context_tokens: number | null;
  created_at: string;
  description: string | null;
  display_name: string | null;
  input_per_mtok_micros: number | null;
  last_seen_at: string;
  last_synced_at: string;
  max_output_tokens: number | null;
  model_id: string;
  no_training_supported: boolean | null;
  output_per_mtok_micros: number | null;
  price_tier: GatewayModelPriceTier | null;
  provider: string;
  providers: string[];
  raw_json: Record<string, unknown>;
  released_at: string | null;
  source_url: string;
  tags: string[];
  type: string | null;
  updated_at: string;
  use_cases: GatewayModelUseCase[];
  web_search_per_query_micros: number | null;
  zdr_supported: boolean | null;
}

export interface GatewayModelSyncRunRecord {
  completed_at: string | null;
  created_at: string;
  error_text: string | null;
  id: string;
  inserted_pricing_count: number;
  model_count: number;
  started_at: string;
  status: "running" | "succeeded" | "failed";
  trigger: "manual" | "scheduled";
  updated_model_count: number;
}

export interface GatewayModelSyncSettingsRecord {
  created_at: string;
  enabled: boolean;
  id: "default";
  interval_ms: number;
  last_run_at: string | null;
  last_success_at: string | null;
  updated_at: string;
}

export interface GatewayModelListFilters {
  availability_purpose?: GatewayModelAvailabilityPurpose | null;
  max_output_per_mtok_micros?: number | null;
  max_price_tier?: GatewayModelPriceTier | null;
  price_tier?: GatewayModelPriceTier | null;
  provider?: string | null;
  search?: string | null;
  use_case?: GatewayModelUseCase | null;
  web_search?: boolean | null;
}

export interface GatewayModelOptionFilters {
  availability_purpose?: GatewayModelAvailabilityPurpose | null;
  max_price_tier?: GatewayModelPriceTier | null;
  search?: string | null;
  use_case?: GatewayModelUseCase | null;
}

export type GatewayModelOption = GatewayModelAvailabilityFlags & {
  display_name: string | null;
  id: string;
  input_per_mtok_micros: number | null;
  label: string;
  model_id: string;
  output_per_mtok_micros: number | null;
  price_tier: GatewayModelPriceTier | null;
  provider: string;
  use_cases: GatewayModelUseCase[];
};

export interface AiGatewayModelStore {
  getActiveModelPricing(params: {
    at: string;
    model_id: string;
  }): Promise<ModelPricingRecord | null>;
  getGatewayModelSyncSettings(): Promise<GatewayModelSyncSettingsRecord | null>;
  insertGatewayModelSyncRun(input: {
    started_at: string;
    status: "running" | "succeeded" | "failed";
    trigger: "manual" | "scheduled";
  }): Promise<GatewayModelSyncRunRecord>;
  insertModelPricing(
    record: Omit<ModelPricingRecord, "id" | "created_at"> & {
      created_at?: string;
      id?: string;
    }
  ): Promise<ModelPricingRecord>;
  listGatewayModelSyncRuns(limit: number): Promise<GatewayModelSyncRunRecord[]>;
  listGatewayModels(
    filters?: GatewayModelListFilters
  ): Promise<GatewayModelRecord[]>;
  /** List pricing catalog (most recent valid_from first). */
  listModelPricing(): Promise<ModelPricingRecord[]>;
  markGatewayModelSyncSettingsRun(successAt?: string | null): Promise<void>;
  updateGatewayModelAvailability(
    modelId: string,
    patch: Partial<GatewayModelAvailabilityFlags>
  ): Promise<GatewayModelRecord>;
  updateGatewayModelSyncRun(
    id: string,
    patch: Partial<
      Pick<
        GatewayModelSyncRunRecord,
        | "completed_at"
        | "error_text"
        | "inserted_pricing_count"
        | "model_count"
        | "status"
        | "updated_model_count"
      >
    >
  ): Promise<GatewayModelSyncRunRecord>;
  upsertGatewayModels(models: GatewayModelUpsertInput[]): Promise<number>;
}

export type GatewayModelUpsertInput = Omit<
  GatewayModelRecord,
  "created_at" | "updated_at"
>;

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

interface SyncGatewayModelsOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  sourceUrl?: string;
  trigger: "manual" | "scheduled";
  updatePricing?: boolean;
}

export interface SyncGatewayModelsResult {
  inserted_pricing_count: number;
  model_count: number;
  run: GatewayModelSyncRunRecord;
  updated_model_count: number;
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

/**
 * Composite price score (micros/Mtok) used for tier classification.
 *
 * When the model has a cached-input price:
 *   score = cached × 50% + input × 25% + output × 25%
 *
 * Otherwise (standard):
 *   score = input × 75% + output × 25%
 *
 * Falls back to output-only when input is unavailable.
 * Returns null when output price is unknown.
 */
export function compositeModelPrice(model: {
  cached_input_per_mtok_micros?: number | null;
  input_per_mtok_micros?: number | null;
  output_per_mtok_micros: number | null;
}): number | null {
  const output = model.output_per_mtok_micros;
  if (output == null) {
    return null;
  }
  const input = model.input_per_mtok_micros ?? null;
  const cached = model.cached_input_per_mtok_micros ?? null;
  if (cached != null && input != null) {
    return cached * 0.5 + input * 0.25 + output * 0.25;
  }
  if (input != null) {
    return input * 0.75 + output * 0.25;
  }
  return output;
}

/**
 * Maps a composite score (micros/Mtok) to a price tier using fixed thresholds.
 *
 * Thresholds in $/Mtok  →  tier
 *   > $3.00             →  expensive
 *   > $2.00             →  high
 *   > $1.00             →  medium
 *   > $0.50             →  low
 *   ≤ $0.50             →  cheap  (includes free / zero-price models)
 */
function scoreMicrosToTier(scoreMicros: number): GatewayModelPriceTier {
  if (scoreMicros > 3_000_000) {
    return "expensive";
  }
  if (scoreMicros > 2_000_000) {
    return "high";
  }
  if (scoreMicros > 1_000_000) {
    return "medium";
  }
  if (scoreMicros > 500_000) {
    return "low";
  }
  return "cheap";
}

export function deriveGatewayModelPriceTiers<
  T extends {
    model_id: string;
    output_per_mtok_micros: number | null;
    input_per_mtok_micros?: number | null;
    cached_input_per_mtok_micros?: number | null;
  },
>(models: T[]): Map<string, GatewayModelPriceTier> {
  const tiers = new Map<string, GatewayModelPriceTier>();
  for (const model of models) {
    const score = compositeModelPrice(model);
    if (score == null) {
      continue; // unknown price → no tier
    }
    tiers.set(model.model_id, scoreMicrosToTier(score));
  }
  return tiers;
}

export function applyGatewayModelPriceTiers<
  T extends {
    model_id: string;
    output_per_mtok_micros: number | null;
    input_per_mtok_micros?: number | null;
    cached_input_per_mtok_micros?: number | null;
  },
>(models: T[]): Array<T & { price_tier: GatewayModelPriceTier | null }> {
  const tiers = deriveGatewayModelPriceTiers(models);
  return models.map((model) => ({
    ...model,
    price_tier: tiers.get(model.model_id) ?? null,
  }));
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
): GatewayModelUpsertInput {
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
    price_tier: null,
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

export async function fetchGatewayModels(
  opts: { fetchImpl?: typeof fetch; sourceUrl?: string } = {}
): Promise<GatewayModelUpsertInput[]> {
  const sourceUrl = opts.sourceUrl ?? GATEWAY_MODELS_URL;
  const response = await (opts.fetchImpl ?? fetch)(sourceUrl);
  if (!response.ok) {
    throw new Error(`Gateway models fetch failed: ${response.status}`);
  }
  const payload = (await response.json()) as GatewayApiResponse;
  return applyGatewayModelPriceTiers(
    (payload.data ?? [])
      .filter((model): model is GatewayApiModel => typeof model.id === "string")
      .map((model) =>
        normalizeGatewayModel(model, { now: new Date(), sourceUrl })
      )
  );
}

function pricingChanged(
  current: ModelPricingRecord | null,
  model: GatewayModelUpsertInput
): boolean {
  if (
    model.input_per_mtok_micros == null ||
    model.output_per_mtok_micros == null
  ) {
    return false;
  }
  return (
    current?.currency !== "usd" ||
    current.input_per_mtok_micros !== model.input_per_mtok_micros ||
    current.output_per_mtok_micros !== model.output_per_mtok_micros ||
    current.cached_input_per_mtok_micros !==
      (model.cached_input_per_mtok_micros ?? 0)
  );
}

export async function syncGatewayModels(
  store: AiGatewayModelStore,
  opts: SyncGatewayModelsOptions
): Promise<SyncGatewayModelsResult> {
  const startedAt = (opts.now ?? new Date()).toISOString();
  const run = await store.insertGatewayModelSyncRun({
    started_at: startedAt,
    status: "running",
    trigger: opts.trigger,
  });
  try {
    const sourceUrl = opts.sourceUrl ?? GATEWAY_MODELS_URL;
    const response = await (opts.fetchImpl ?? fetch)(sourceUrl);
    if (!response.ok) {
      throw new Error(`Gateway models fetch failed: ${response.status}`);
    }
    const payload = (await response.json()) as GatewayApiResponse;
    const now = opts.now ?? new Date();
    const models = applyGatewayModelPriceTiers(
      (payload.data ?? [])
        .filter(
          (model): model is GatewayApiModel => typeof model.id === "string"
        )
        .map((model) => normalizeGatewayModel(model, { now, sourceUrl }))
    );
    const updatedModelCount = await store.upsertGatewayModels(models);
    let insertedPricingCount = 0;
    if (opts.updatePricing) {
      const nowIso = now.toISOString();

      // Single batch fetch instead of one getActiveModelPricing call per model.
      const allPricingRows = await store.listModelPricing();

      // Derive the active row per model locally (same logic as getActiveModelPricing):
      // rows are sorted valid_from DESC, so the first matching row wins.
      const activeByModel = new Map<string, ModelPricingRecord>();
      for (const row of allPricingRows) {
        if (activeByModel.has(row.model_id)) {
          continue;
        }
        const validFrom = new Date(row.valid_from);
        const validTo = row.valid_to ? new Date(row.valid_to) : null;
        if (validFrom <= now && (validTo === null || validTo > now)) {
          activeByModel.set(row.model_id, row);
        }
      }

      for (const model of models) {
        const current = activeByModel.get(model.model_id) ?? null;
        if (!pricingChanged(current, model)) {
          continue;
        }
        await store.insertModelPricing({
          cached_input_per_mtok_micros: model.cached_input_per_mtok_micros ?? 0,
          currency: "usd",
          input_per_mtok_micros: model.input_per_mtok_micros ?? 0,
          model_id: model.model_id,
          output_per_mtok_micros: model.output_per_mtok_micros ?? 0,
          reasoning_per_mtok_micros: 0,
          valid_from: nowIso,
          valid_to: null,
        });
        insertedPricingCount += 1;
      }
    }
    const completed = await store.updateGatewayModelSyncRun(run.id, {
      completed_at: new Date().toISOString(),
      inserted_pricing_count: insertedPricingCount,
      model_count: models.length,
      status: "succeeded",
      updated_model_count: updatedModelCount,
    });
    return {
      inserted_pricing_count: insertedPricingCount,
      model_count: models.length,
      run: completed,
      updated_model_count: updatedModelCount,
    };
  } catch (err) {
    await store.updateGatewayModelSyncRun(run.id, {
      completed_at: new Date().toISOString(),
      error_text: err instanceof Error ? err.message : String(err),
      status: "failed",
    });
    throw err;
  }
}
