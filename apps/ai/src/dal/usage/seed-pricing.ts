import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  type AiUsageStore,
  DEFAULT_MODEL_PRICING_SEEDS,
  type ModelPricingSeed,
} from "@engenty/ai-core";
import type { AiGatewayModelStore } from "../../gateway-models.js";

async function findWorkspaceRoot(): Promise<string> {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    try {
      await fs.access(join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  return process.cwd();
}

async function loadJsonDefaults(): Promise<ModelPricingSeed[] | null> {
  try {
    const root = await findWorkspaceRoot();
    const possiblePaths = [
      resolve(root, "apps/ai/config/default-pricing.json"),
      resolve(root, "default-pricing.json"),
    ];

    for (const filePath of possiblePaths) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed as ModelPricingSeed[];
        }
      } catch {
        // Skip and try next path
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

/**
 * The default model-pricing seed set actually used by seed/restore: the
 * `default-pricing.json` catalog when present, otherwise the bundled
 * `DEFAULT_MODEL_PRICING_SEEDS` fallback. Exported so callers and tests reason
 * about the same resolved set instead of assuming the fallback.
 */
export async function resolveModelPricingSeeds(): Promise<ModelPricingSeed[]> {
  return (await loadJsonDefaults()) ?? DEFAULT_MODEL_PRICING_SEEDS;
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

  const seeds = await resolveModelPricingSeeds();

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
 * Fetches the full pricing catalog in a single query, derives the currently
 * active row per model locally (same logic as `getActiveModelPricing`), then
 * inserts a new row only for models whose active pricing differs from the
 * seed values or is missing entirely.
 *
 * When `gatewayStore` is provided and a seed entry carries `available_for_*`
 * flags, those flags are applied to the `ai.model` catalog row as well —
 * restoring the active/inactive state that was captured at export time.
 *
 * Both operations use a single batch fetch to avoid N+1 round-trips.
 */
export async function restoreAiUsageModelPricingDefaults(
  store: AiUsageStore,
  gatewayStore?: AiGatewayModelStore | null
): Promise<{ restored: number; availability_restored: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const seeds = await resolveModelPricingSeeds();

  // Single batch fetch — rows are already sorted by valid_from DESC.
  const allRows = await store.listModelPricing();

  // Build a map: model_id → the currently active pricing row.
  // "Active" means valid_from <= now AND (valid_to is null OR valid_to > now).
  const activeByModel = new Map<string, (typeof allRows)[number]>();
  for (const row of allRows) {
    if (activeByModel.has(row.model_id)) {
      // Already captured the most-recent row for this model; skip older ones.
      continue;
    }
    const validFrom = new Date(row.valid_from);
    const validTo = row.valid_to ? new Date(row.valid_to) : null;
    if (validFrom <= now && (validTo === null || validTo > now)) {
      activeByModel.set(row.model_id, row);
    }
  }

  let restored = 0;
  let availability_restored = 0;

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

    if (isDifferent) {
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

    // Restore availability flags when the seed carries them and the gateway
    // store is available. Only write when at least one flag is defined.
    if (gatewayStore && hasAvailabilityFlags(seed)) {
      const patch = availabilityPatchFromSeed(seed);
      await gatewayStore.updateGatewayModelAvailability(seed.model_id, patch);
      availability_restored += 1;
    }
  }

  return { restored, availability_restored };
}

/** Returns true when the seed carries at least one availability flag. */
function hasAvailabilityFlags(seed: ModelPricingSeed): boolean {
  return (
    seed.available_for_chat !== undefined ||
    seed.available_for_embedding !== undefined ||
    seed.available_for_image !== undefined ||
    seed.available_for_rerank !== undefined ||
    seed.available_for_routing !== undefined ||
    seed.available_for_video !== undefined
  );
}

/** Builds a full availability patch from seed flags, defaulting absent flags to false. */
function availabilityPatchFromSeed(
  seed: ModelPricingSeed
): Parameters<AiGatewayModelStore["updateGatewayModelAvailability"]>[1] {
  return {
    available_for_chat: seed.available_for_chat ?? false,
    available_for_embedding: seed.available_for_embedding ?? false,
    available_for_image: seed.available_for_image ?? false,
    available_for_rerank: seed.available_for_rerank ?? false,
    available_for_routing: seed.available_for_routing ?? false,
    available_for_video: seed.available_for_video ?? false,
  };
}
