import {
  type AiUsageStore,
  DEFAULT_MODEL_PRICING_SEEDS,
  type ModelPricingSeed,
} from "@engenty/ai-core";
import {
  activePricingByModel,
  shippedModelDefaults,
} from "../../model-defaults.js";

/**
 * The default model-pricing seed set used by seed/restore: the bundled
 * `DEFAULT_MODEL_PRICING_SEEDS` overlaid with the committed
 * `available-models.json` prices.
 */
export function resolveModelPricingSeeds(): ModelPricingSeed[] {
  // MERGED, not replaced. The JSON used to win outright, and the copy on disk
  // carried only 15 Google models — so every OpenAI and Anthropic seed silently
  // vanished and their usage was priced at FALLBACK_MODEL_PRICING ($5/$15 per
  // Mtok) instead of the real card. Measured 2026-08-28: a gpt-5.6-luna thread
  // reported $4.53 against a true ~$0.19.
  //
  // The committed entry wins per model id; models it does not mention keep the
  // bundled seed rather than falling off the catalog.
  const byModel = new Map<string, ModelPricingSeed>();
  for (const seed of DEFAULT_MODEL_PRICING_SEEDS) {
    byModel.set(seed.model_id, seed);
  }
  for (const model of shippedModelDefaults().models) {
    byModel.set(model.model_id, {
      cached_input_per_mtok_micros: model.cached_input_per_mtok_micros,
      currency: model.currency,
      input_per_mtok_micros: model.input_per_mtok_micros,
      model_id: model.model_id,
      output_per_mtok_micros: model.output_per_mtok_micros,
      reasoning_per_mtok_micros: model.reasoning_per_mtok_micros,
    });
  }
  return [...byModel.values()];
}

/**
 * Seed the AI app-local model-pricing catalog.
 *
 * The latest `valid_from` row wins at lookup time, so seeds only fill models
 * that do not have any pricing row yet. Operator-managed rows are left intact.
 */
export async function seedAiUsageModelPricing(
  store: AiUsageStore
): Promise<{ inserted: number }> {
  const now = new Date();
  const existing = await store.listModelPricing();
  const existingModels = new Set(existing.map((row) => row.model_id));
  let inserted = 0;

  const seeds = resolveModelPricingSeeds();

  for (const seed of seeds) {
    if (existingModels.has(seed.model_id)) {
      continue;
    }
    await store.insertModelPricing({
      cached_input_per_mtok_micros: seed.cached_input_per_mtok_micros ?? 0,
      currency: seed.currency ?? "usd",
      input_per_mtok_micros: seed.input_per_mtok_micros ?? 0,
      model_id: seed.model_id,
      output_per_mtok_micros: seed.output_per_mtok_micros ?? 0,
      reasoning_per_mtok_micros: seed.reasoning_per_mtok_micros ?? 0,
      valid_from: now.toISOString(),
      valid_to: null,
    });
    inserted += 1;
  }

  return { inserted };
}

/**
 * Restore the AI app-local model-pricing catalog to default values.
 *
 * Fetches the full pricing catalog in one query, derives the active row per
 * model locally, then inserts a new row only for models whose active pricing
 * differs from the seed or is missing. Activation and bindings are restored by
 * `restoreModelDefaults`.
 */
export async function restoreAiUsageModelPricingDefaults(
  store: AiUsageStore
): Promise<{ restored: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const seeds = resolveModelPricingSeeds();
  const activeByModel = activePricingByModel(
    await store.listModelPricing(),
    now
  );

  let restored = 0;
  for (const seed of seeds) {
    const active = activeByModel.get(seed.model_id) ?? null;
    const isDifferent =
      !active ||
      active.currency !== (seed.currency ?? "usd") ||
      active.input_per_mtok_micros !== (seed.input_per_mtok_micros ?? 0) ||
      active.output_per_mtok_micros !== (seed.output_per_mtok_micros ?? 0) ||
      active.cached_input_per_mtok_micros !==
        (seed.cached_input_per_mtok_micros ?? 0) ||
      active.reasoning_per_mtok_micros !==
        (seed.reasoning_per_mtok_micros ?? 0);
    if (!isDifferent) {
      continue;
    }
    await store.insertModelPricing({
      cached_input_per_mtok_micros: seed.cached_input_per_mtok_micros ?? 0,
      currency: seed.currency ?? "usd",
      input_per_mtok_micros: seed.input_per_mtok_micros ?? 0,
      model_id: seed.model_id,
      output_per_mtok_micros: seed.output_per_mtok_micros ?? 0,
      reasoning_per_mtok_micros: seed.reasoning_per_mtok_micros ?? 0,
      valid_from: nowIso,
      valid_to: null,
    });
    restored += 1;
  }
  return { restored };
}
