import type { ModelPricingRecord } from "@engenty/ai-core";
import {
  listModelGateways,
  type ModelGateway,
} from "./model-gateways/index.js";

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
  /** Which gateway serves this row. Never part of `model_id`. */
  gateway: string;
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
  gateway?: string | null;
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
  gateway?: string | null;
  max_price_tier?: GatewayModelPriceTier | null;
  search?: string | null;
  use_case?: GatewayModelUseCase | null;
}

export type GatewayModelOption = GatewayModelAvailabilityFlags & {
  context_tokens: number | null;
  display_name: string | null;
  gateway: string;
  id: string;
  input_per_mtok_micros: number | null;
  label: string;
  model_id: string;
  output_per_mtok_micros: number | null;
  price_tier: GatewayModelPriceTier | null;
  provider: string;
  use_cases: GatewayModelUseCase[];
  vision: boolean;
  web_search: boolean;
};

export interface ModelBindingRecord {
  gateway: string;
  model_id: string;
  role: string;
  scope: string;
  updated_at: string;
}

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
  /** Every role binding for a scope, as stored. */
  listModelBindings(scope?: string): Promise<ModelBindingRecord[]>;
  /** List pricing catalog (most recent valid_from first). */
  listModelPricing(): Promise<ModelPricingRecord[]>;
  markGatewayModelSyncSettingsRun(successAt?: string | null): Promise<void>;
  /** Insert bindings that do not exist yet; never overwrite a bound role. */
  seedModelBindings(
    rows: readonly Omit<ModelBindingRecord, "updated_at">[]
  ): Promise<number>;
  /**
   * Patch availability for a catalog row. Omitting `gateway` patches every
   * gateway serving the id, which is what a pricing-seed restore wants.
   */
  updateGatewayModelAvailability(
    modelId: string,
    patch: Partial<GatewayModelAvailabilityFlags>,
    gateway?: string
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
  /** Rebind one role. */
  upsertModelBinding(
    row: Omit<ModelBindingRecord, "updated_at">
  ): Promise<ModelBindingRecord>;
}

export type GatewayModelUpsertInput = Omit<
  GatewayModelRecord,
  "created_at" | "updated_at"
>;

interface SyncGatewayModelsOptions {
  fetchImpl?: typeof fetch;
  /** Defaults to every registered adapter; narrow it in tests. */
  gateways?: readonly ModelGateway[];
  now?: Date;
  trigger: "manual" | "scheduled";
  updatePricing?: boolean;
}

export interface GatewaySyncCounts {
  model_count: number;
  updated_model_count: number;
}

export interface SyncGatewayModelsResult {
  /** Per-gateway counts, keyed by gateway id. Not persisted on the run row. */
  by_gateway: Record<string, GatewaySyncCounts>;
  inserted_pricing_count: number;
  model_count: number;
  run: GatewayModelSyncRunRecord;
  updated_model_count: number;
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
 *   > $4.00             →  expensive
 *   > $2.00             →  high
 *   > $1.00             →  medium
 *   > $0.50             →  low
 *   ≤ $0.50             →  cheap  (includes free / zero-price models)
 */
function scoreMicrosToTier(scoreMicros: number): GatewayModelPriceTier {
  if (scoreMicros > 4_000_000) {
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
    const now = opts.now ?? new Date();
    const byGateway: Record<string, GatewaySyncCounts> = {};
    const models: GatewayModelUpsertInput[] = [];
    let updatedModelCount = 0;
    for (const gateway of opts.gateways ?? listModelGateways()) {
      const rows = applyGatewayModelPriceTiers(
        (await gateway.listModels({ fetchImpl: opts.fetchImpl, now })).map(
          // Tagged here rather than in the adapter, so no gateway can write
          // rows into another gateway's half of the catalog.
          (model) => ({ ...model, gateway: gateway.id })
        )
      );
      const updated = await store.upsertGatewayModels(rows);
      byGateway[gateway.id] = {
        model_count: rows.length,
        updated_model_count: updated,
      };
      models.push(...rows);
      updatedModelCount += updated;
    }
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

      // Pricing is keyed by model id alone, so two gateways serving the same
      // model contribute one row — the first one that reports a change.
      const priced = new Set<string>();
      for (const model of models) {
        const current = activeByModel.get(model.model_id) ?? null;
        if (priced.has(model.model_id) || !pricingChanged(current, model)) {
          continue;
        }
        priced.add(model.model_id);
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
      by_gateway: byGateway,
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
