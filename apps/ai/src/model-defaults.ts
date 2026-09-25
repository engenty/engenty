import {
  AI_PLATFORM_ROLES,
  type AiUsageStore,
  isStockPlatformBindings,
  listRegisteredModelRoles,
  type ModelPricingRecord,
  mergeDeclaredRoles,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { z } from "zod";
import shippedAvailable from "../config/available-models.json" with {
  type: "json",
};
import shippedBindings from "../config/default-models.json" with {
  type: "json",
};
import {
  type AiGatewayModelStore,
  GATEWAY_MODEL_PRICE_TIERS,
  GATEWAY_MODEL_USE_CASES,
  type GatewayModelAvailabilityFlags,
  type GatewayModelRecord,
  type GatewayModelUpsertInput,
} from "./gateway-models.js";

/**
 * Committed model defaults, two files in `apps/ai/config/`:
 * - `available-models.json` — which catalog models are activated, with their
 *   pricing (manage → AI models → Export)
 * - `default-models.json` — which gateway and model each role is bound to
 *   (manage → Role bindings → Export)
 *
 * A reset DB or a new server gets both back on boot (see
 * `applyModelDefaultsIfFresh`) and manage's "Restore defaults" re-applies them
 * on demand. The JSON is bundled at build time, so the Docker image carries it
 * without a config mount.
 */

const logger = createLogger({ name: "apps/ai/model-defaults" });

const AVAILABILITY_KEYS = [
  "available_for_agent",
  "available_for_classification",
  "available_for_embedding",
  "available_for_image",
  "available_for_realtime",
  "available_for_rerank",
  "available_for_text",
  "available_for_transcription",
  "available_for_video",
] as const satisfies readonly (keyof GatewayModelAvailabilityFlags)[];

const micros = z.number().int().nonnegative();

/**
 * One catalog row as the models table shows it: descriptive data from the
 * gateway sync, plus the operator's activation and pricing. Complete, so a
 * database without a sync yet can be filled from the file alone.
 */
const modelDefaultSchema = z.object({
  gateway: z.string().min(1),
  model_id: z.string().min(1),
  display_name: z.string().nullable(),
  description: z.string().nullable(),
  provider: z.string().min(1),
  providers: z.array(z.string()),
  type: z.string().nullable(),
  tags: z.array(z.string()),
  use_cases: z.array(z.enum(GATEWAY_MODEL_USE_CASES)),
  price_tier: z.enum(GATEWAY_MODEL_PRICE_TIERS).nullable(),
  context_tokens: z.number().int().nullable(),
  max_output_tokens: z.number().int().nullable(),
  released_at: z.string().nullable(),
  capabilities: z.record(z.string(), z.unknown()),
  regions: z.array(z.string()),
  zdr_supported: z.boolean().nullable(),
  no_training_supported: z.boolean().nullable(),
  source_url: z.string(),
  web_search_per_query_micros: micros.nullable(),
  currency: z.string().min(1),
  input_per_mtok_micros: micros,
  output_per_mtok_micros: micros,
  cached_input_per_mtok_micros: micros,
  reasoning_per_mtok_micros: micros,
  available_for_agent: z.boolean(),
  available_for_embedding: z.boolean(),
  available_for_image: z.boolean(),
  available_for_rerank: z.boolean(),
  available_for_classification: z.boolean(),
  available_for_realtime: z.boolean(),
  available_for_text: z.boolean(),
  available_for_transcription: z.boolean(),
  available_for_video: z.boolean(),
});

const bindingDefaultSchema = z.object({
  role: z.string().min(1),
  gateway: z.string().min(1),
  model_id: z.string().min(1),
});

export const availableModelsSchema = z.object({
  models: z.array(modelDefaultSchema),
});

/** Role → `{ gateway, model_id }`: each role names its own gateway. */
export const defaultBindingsSchema = z.object({
  roles: z.record(
    z.string().min(1),
    z.object({ gateway: z.string().min(1), model_id: z.string().min(1) })
  ),
});

export type AvailableModels = z.infer<typeof availableModelsSchema>;
export type DefaultBindings = z.infer<typeof defaultBindingsSchema>;

export interface ModelDefaults {
  bindings: BindingDefault[];
  models: ModelDefault[];
}
export type ModelDefault = z.infer<typeof modelDefaultSchema>;
export type BindingDefault = z.infer<typeof bindingDefaultSchema>;

export function bindingsFromDefaults(file: DefaultBindings): BindingDefault[] {
  return Object.entries(file.roles)
    .map(([role, binding]) => ({ role, ...binding }))
    .sort((left, right) => left.role.localeCompare(right.role));
}

let parsedShipped: ModelDefaults | null = null;

/** The committed defaults. Throws on a malformed file — it is code, not input. */
export function shippedModelDefaults(): ModelDefaults {
  parsedShipped ??= {
    models: availableModelsSchema.parse(shippedAvailable).models,
    bindings: bindingsFromDefaults(
      defaultBindingsSchema.parse(shippedBindings)
    ),
  };
  return parsedShipped;
}

const catalogKey = (gateway: string, modelId: string) =>
  `${gateway}\u0000${modelId}`;

export function isModelActivated(row: GatewayModelAvailabilityFlags): boolean {
  return AVAILABILITY_KEYS.some((key) => row[key]);
}

function availabilityOf(
  row: GatewayModelAvailabilityFlags
): GatewayModelAvailabilityFlags {
  return Object.fromEntries(
    AVAILABILITY_KEYS.map((key) => [key, row[key]])
  ) as unknown as GatewayModelAvailabilityFlags;
}

const NONE_AVAILABLE = Object.fromEntries(
  AVAILABILITY_KEYS.map((key) => [key, false])
) as unknown as GatewayModelAvailabilityFlags;

/**
 * The currently active pricing row per model. `rows` must be sorted by
 * `valid_from` DESC (what `listModelPricing` returns).
 */
export function activePricingByModel(
  rows: readonly ModelPricingRecord[],
  now: Date
): Map<string, ModelPricingRecord> {
  const active = new Map<string, ModelPricingRecord>();
  for (const row of rows) {
    if (active.has(row.model_id)) {
      continue;
    }
    const validTo = row.valid_to ? new Date(row.valid_to) : null;
    if (
      new Date(row.valid_from) <= now &&
      (validTo === null || validTo > now)
    ) {
      active.set(row.model_id, row);
    }
  }
  return active;
}

/**
 * Snapshot the live activation and pricing as `available-models.json`. The
 * bindings export (`default-models.json`) is built by manage from the binding
 * list.
 */
export async function exportAvailableModels(
  usageStore: AiUsageStore,
  gatewayStore: AiGatewayModelStore,
  now = new Date()
): Promise<AvailableModels> {
  const [catalog, pricingRows] = await Promise.all([
    gatewayStore.listGatewayModels({}),
    usageStore.listModelPricing(),
  ]);
  const pricing = activePricingByModel(pricingRows, now);
  const models = catalog
    .filter(isModelActivated)
    .sort(
      (left, right) =>
        left.gateway.localeCompare(right.gateway) ||
        left.model_id.localeCompare(right.model_id)
    )
    .map((row) => {
      const price = pricing.get(row.model_id);
      return {
        gateway: row.gateway,
        model_id: row.model_id,
        display_name: row.display_name,
        description: row.description,
        provider: row.provider,
        providers: row.providers,
        type: row.type,
        tags: row.tags,
        use_cases: row.use_cases,
        price_tier: row.price_tier,
        context_tokens: row.context_tokens,
        max_output_tokens: row.max_output_tokens,
        released_at: row.released_at,
        capabilities: row.capabilities,
        regions: row.regions,
        zdr_supported: row.zdr_supported,
        no_training_supported: row.no_training_supported,
        source_url: row.source_url,
        web_search_per_query_micros: row.web_search_per_query_micros,
        currency: price?.currency ?? "usd",
        input_per_mtok_micros:
          price?.input_per_mtok_micros ?? row.input_per_mtok_micros ?? 0,
        output_per_mtok_micros:
          price?.output_per_mtok_micros ?? row.output_per_mtok_micros ?? 0,
        cached_input_per_mtok_micros:
          price?.cached_input_per_mtok_micros ??
          row.cached_input_per_mtok_micros ??
          0,
        // The catalog carries no reasoning price; only a pricing row does.
        reasoning_per_mtok_micros: price?.reasoning_per_mtok_micros ?? 0,
        ...availabilityOf(row),
      };
    });
  return { models };
}

export interface AvailabilityApplyResult {
  applied: number;
  deactivated: number;
  /** Listed models the catalog did not carry yet, added from the file. */
  inserted: number;
}

/**
 * Make the catalog's activation match `models` exactly: listed models get
 * their flags, every other activated model is deactivated. A listed model the
 * catalog does not carry yet (gateway not synced) is added from the file; the
 * next sync refreshes its descriptive data and keeps its activation.
 */
export async function applyAvailabilityDefaults(
  store: AiGatewayModelStore,
  models: readonly ModelDefault[],
  catalog: readonly GatewayModelRecord[]
): Promise<AvailabilityApplyResult> {
  const rows = new Map(
    catalog.map((row) => [catalogKey(row.gateway, row.model_id), row])
  );
  const listed = new Set<string>();
  const result: AvailabilityApplyResult = {
    applied: 0,
    deactivated: 0,
    inserted: 0,
  };
  const missing: GatewayModelUpsertInput[] = [];
  const now = new Date().toISOString();
  for (const model of models) {
    const key = catalogKey(model.gateway, model.model_id);
    listed.add(key);
    const row = rows.get(key);
    if (!row) {
      missing.push(catalogRowFromDefault(model, now));
      continue;
    }
    const flags = availabilityOf(model);
    if (AVAILABILITY_KEYS.some((flag) => row[flag] !== flags[flag])) {
      await store.updateGatewayModelAvailability(
        row.model_id,
        flags,
        row.gateway
      );
      result.applied += 1;
    }
  }
  for (const row of catalog) {
    if (
      isModelActivated(row) &&
      !listed.has(catalogKey(row.gateway, row.model_id))
    ) {
      await store.updateGatewayModelAvailability(
        row.model_id,
        NONE_AVAILABLE,
        row.gateway
      );
      result.deactivated += 1;
    }
  }
  if (missing.length > 0) {
    result.inserted = (await store.upsertGatewayModels(missing)).inserted;
  }
  return result;
}

function catalogRowFromDefault(
  model: ModelDefault,
  now: string
): GatewayModelUpsertInput {
  const {
    currency: _currency,
    reasoning_per_mtok_micros: _reasoning,
    ...row
  } = model;
  return { ...row, last_seen_at: now, last_synced_at: now, raw_json: {} };
}

export interface BindingApplyResult {
  applied: number;
  /** `role → gateway:model_id` entries skipped: unknown role or model not in the catalog. */
  skipped: string[];
}

/** Upsert the committed platform bindings whose role and model exist. */
export async function applyBindingDefaults(
  store: AiGatewayModelStore,
  bindings: readonly BindingDefault[],
  catalog: readonly GatewayModelRecord[]
): Promise<BindingApplyResult> {
  const known = new Set(
    mergeDeclaredRoles(listRegisteredModelRoles()).map((spec) => spec.role)
  );
  const inCatalog = new Set(
    catalog.map((row) => catalogKey(row.gateway, row.model_id))
  );
  const result: BindingApplyResult = { applied: 0, skipped: [] };
  for (const binding of bindings) {
    if (
      !(
        known.has(binding.role) &&
        inCatalog.has(catalogKey(binding.gateway, binding.model_id))
      )
    ) {
      result.skipped.push(
        `${binding.role} → ${binding.gateway}:${binding.model_id}`
      );
      continue;
    }
    await store.upsertModelBinding({ ...binding, scope: "platform" });
    result.applied += 1;
  }
  return result;
}

/** Apply both parts unconditionally — manage's "Restore defaults". */
export async function restoreModelDefaults(
  store: AiGatewayModelStore,
  defaults: ModelDefaults = shippedModelDefaults()
): Promise<{
  availability: AvailabilityApplyResult;
  bindings: BindingApplyResult;
}> {
  const availability = await applyAvailabilityDefaults(
    store,
    defaults.models,
    await store.listGatewayModels({})
  );
  // Re-read: the availability step may have added models the bindings name.
  const catalog = await store.listGatewayModels({});
  return {
    availability,
    bindings: await applyBindingDefaults(store, defaults.bindings, catalog),
  };
}

/**
 * Apply the committed defaults to a catalog nobody has configured yet — run
 * after every gateway sync that can populate a fresh catalog (boot bootstrap,
 * key save). Idempotent and never overrides an operator's choice:
 * - activation only when no model is activated (a catalog with nothing
 *   activated is unusable, so this is exactly the reset / new-server state)
 * - bindings only while the table is empty or still a shipped binding pack
 */
export async function applyModelDefaultsIfFresh(
  store: AiGatewayModelStore,
  defaults: ModelDefaults = shippedModelDefaults()
): Promise<{
  availability: AvailabilityApplyResult | null;
  bindings: BindingApplyResult | null;
}> {
  const catalog = await store.listGatewayModels({});
  const availability = catalog.some(isModelActivated)
    ? null
    : await applyAvailabilityDefaults(store, defaults.models, catalog);

  const current = (await store.listModelBindings("platform")).map((row) => ({
    gateway: row.gateway,
    modelId: row.model_id,
    role: row.role,
  }));
  const bindings = isStockPlatformBindings(
    current,
    AI_PLATFORM_ROLES.map((spec) => spec.role)
  )
    ? await applyBindingDefaults(
        store,
        defaults.bindings,
        availability?.inserted ? await store.listGatewayModels({}) : catalog
      )
    : null;

  if (availability || bindings) {
    logger.info("Applied committed model defaults", {
      activated: availability?.applied ?? 0,
      added: availability?.inserted ?? 0,
      bindings: bindings?.applied ?? 0,
      skipped: bindings?.skipped ?? [],
    });
  }
  return { availability, bindings };
}
