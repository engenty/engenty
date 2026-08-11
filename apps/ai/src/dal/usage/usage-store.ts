import type {
  AiUsageStore,
  ModelPricingRecord,
  TenantUsagePolicyRecord,
  UsageEventRecord,
  UsagePeriodTotalRecord,
  UserUsagePolicyRecord,
} from "@engenty/ai-core";
import type {
  AiGatewayModelStore,
  GatewayModelAvailabilityFlags,
  GatewayModelAvailabilityPurpose,
  GatewayModelRecord,
  GatewayModelSyncRunRecord,
  GatewayModelSyncSettingsRecord,
  GatewayModelUpsertInput,
  ModelBindingRecord,
} from "../../gateway-models.js";
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";

const AI_SCHEMA = "ai";

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  return value == null ? null : asNumber(value, 0);
}

function asNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : null;
}

function asRequiredStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function mapPricing(row: Record<string, unknown>): ModelPricingRecord {
  return {
    id: String(row.id),
    model_id: String(row.model_id),
    currency: String(row.currency ?? "usd"),
    input_per_mtok_micros: asNumber(row.input_per_mtok_micros),
    output_per_mtok_micros: asNumber(row.output_per_mtok_micros),
    cached_input_per_mtok_micros: asNumber(row.cached_input_per_mtok_micros),
    reasoning_per_mtok_micros: asNumber(row.reasoning_per_mtok_micros),
    valid_from: String(row.valid_from),
    valid_to: asNullableString(row.valid_to),
    created_at: String(row.created_at),
  };
}

function mapGatewayModel(row: Record<string, unknown>): GatewayModelRecord {
  return {
    available_for_chat: asBoolean(row.available_for_chat),
    available_for_embedding: asBoolean(row.available_for_embedding),
    available_for_image: asBoolean(row.available_for_image),
    available_for_rerank: asBoolean(row.available_for_rerank),
    available_for_routing: asBoolean(row.available_for_routing),
    available_for_video: asBoolean(row.available_for_video),
    cached_input_per_mtok_micros: asNullableNumber(
      row.cached_input_per_mtok_micros
    ),
    capabilities:
      row.capabilities && typeof row.capabilities === "object"
        ? (row.capabilities as Record<string, unknown>)
        : {},
    context_tokens: asNullableNumber(row.context_tokens),
    created_at: String(row.created_at),
    description: asNullableString(row.description),
    display_name: asNullableString(row.display_name),
    gateway: String(row.gateway),
    input_per_mtok_micros: asNullableNumber(row.input_per_mtok_micros),
    last_seen_at: String(row.last_seen_at),
    last_synced_at: String(row.last_synced_at),
    max_output_tokens: asNullableNumber(row.max_output_tokens),
    model_id: String(row.model_id),
    no_training_supported:
      row.no_training_supported == null
        ? null
        : asBoolean(row.no_training_supported),
    output_per_mtok_micros: asNullableNumber(row.output_per_mtok_micros),
    price_tier: asNullableString(
      row.price_tier
    ) as GatewayModelRecord["price_tier"],
    provider: String(row.provider),
    providers: asRequiredStringArray(row.providers),
    raw_json:
      row.raw_json && typeof row.raw_json === "object"
        ? (row.raw_json as Record<string, unknown>)
        : {},
    released_at: asNullableString(row.released_at),
    source_url: String(row.source_url),
    tags: asRequiredStringArray(row.tags),
    type: asNullableString(row.type),
    updated_at: String(row.updated_at),
    use_cases: asRequiredStringArray(
      row.use_cases
    ) as GatewayModelRecord["use_cases"],
    web_search_per_query_micros: asNullableNumber(
      row.web_search_per_query_micros
    ),
    zdr_supported:
      row.zdr_supported == null ? null : asBoolean(row.zdr_supported),
  };
}

function availabilityColumnForPurpose(
  purpose: GatewayModelAvailabilityPurpose
): keyof GatewayModelAvailabilityFlags {
  switch (purpose) {
    case "chat":
      return "available_for_chat";
    case "routing":
      return "available_for_routing";
    case "embedding":
      return "available_for_embedding";
    case "image":
      return "available_for_image";
    case "video":
      return "available_for_video";
    case "rerank":
      return "available_for_rerank";
    default:
      return assertNeverPurpose(purpose);
  }
}

function assertNeverPurpose(value: never): never {
  throw new Error(`Unhandled gateway model availability purpose: ${value}`);
}

/** Keep PostgREST `.in(model_id, …)` URLs under limits (~297 gateway models). */
export const GATEWAY_MODEL_UPSERT_BATCH_SIZE = 50;

export function chunkGatewayModelBatch<T>(
  items: readonly T[],
  batchSize = GATEWAY_MODEL_UPSERT_BATCH_SIZE
): T[][] {
  if (batchSize < 1) {
    throw new Error("batchSize must be at least 1");
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    chunks.push(items.slice(index, index + batchSize));
  }
  return chunks;
}

const GATEWAY_MODEL_AVAILABILITY_SELECT = [
  "gateway",
  "model_id",
  "available_for_chat",
  "available_for_routing",
  "available_for_embedding",
  "available_for_image",
  "available_for_video",
  "available_for_rerank",
].join(",");

/** Catalog rows are identified by (gateway, model_id), so the cache key is too. */
function gatewayModelKey(row: { gateway: string; model_id: string }): string {
  return `${row.gateway}\t${row.model_id}`;
}

function mapGatewayModelAvailabilityRow(
  row: Record<string, unknown>
): [string, GatewayModelAvailabilityFlags] {
  return [
    gatewayModelKey({
      gateway: String(row.gateway),
      model_id: String(row.model_id),
    }),
    {
      available_for_chat: asBoolean(row.available_for_chat),
      available_for_embedding: asBoolean(row.available_for_embedding),
      available_for_image: asBoolean(row.available_for_image),
      available_for_rerank: asBoolean(row.available_for_rerank),
      available_for_routing: asBoolean(row.available_for_routing),
      available_for_video: asBoolean(row.available_for_video),
    },
  ];
}

function preserveExistingAvailability(
  model: GatewayModelUpsertInput,
  existing: GatewayModelAvailabilityFlags | undefined
): GatewayModelUpsertInput {
  if (!existing) {
    return model;
  }
  return {
    ...model,
    ...existing,
  };
}

function mapGatewayModelSyncRun(
  row: Record<string, unknown>
): GatewayModelSyncRunRecord {
  return {
    completed_at: asNullableString(row.completed_at),
    created_at: String(row.created_at),
    error_text: asNullableString(row.error_text),
    id: String(row.id),
    inserted_pricing_count: asNumber(row.inserted_pricing_count),
    model_count: asNumber(row.model_count),
    started_at: String(row.started_at),
    status: String(row.status) as GatewayModelSyncRunRecord["status"],
    trigger: String(row.trigger) as GatewayModelSyncRunRecord["trigger"],
    updated_model_count: asNumber(row.updated_model_count),
  };
}

function mapGatewayModelSyncSettings(
  row: Record<string, unknown>
): GatewayModelSyncSettingsRecord {
  return {
    created_at: String(row.created_at),
    enabled: asBoolean(row.enabled),
    id: "default",
    interval_ms: asNumber(row.interval_ms, 86_400_000),
    last_run_at: asNullableString(row.last_run_at),
    last_success_at: asNullableString(row.last_success_at),
    updated_at: String(row.updated_at),
  };
}

function mapTenantPolicy(
  row: Record<string, unknown>
): TenantUsagePolicyRecord {
  return {
    tenant_id: String(row.tenant_id),
    tier: String(row.tier ?? "free"),
    period_mode: row.period_mode === "rolling" ? "rolling" : "calendar",
    period_unit:
      row.period_unit === "day"
        ? "day"
        : row.period_unit === "week"
          ? "week"
          : "month",
    period_anchor: asNullableString(row.period_anchor),
    included_input_tokens: asNullableNumber(row.included_input_tokens),
    included_output_tokens: asNullableNumber(row.included_output_tokens),
    included_cost_micros: asNullableNumber(row.included_cost_micros),
    hard_limit_cost_micros: asNullableNumber(row.hard_limit_cost_micros),
    soft_limit_cost_micros: asNullableNumber(row.soft_limit_cost_micros),
    allowed_models: asStringArray(row.allowed_models),
    allowed_providers: asStringArray(row.allowed_providers),
    allowed_efforts: asStringArray(row.allowed_efforts),
    enforcement_mode:
      row.enforcement_mode === "enforce" ? "enforce" : "observe",
    currency: String(row.currency ?? "usd"),
    managed_by: row.managed_by === "entitlement" ? "entitlement" : "tenant",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapUserPolicy(row: Record<string, unknown>): UserUsagePolicyRecord {
  return {
    tenant_id: String(row.tenant_id),
    user_id: String(row.user_id),
    max_cost_micros: asNullableNumber(row.max_cost_micros),
    max_total_tokens: asNullableNumber(row.max_total_tokens),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapEvent(row: Record<string, unknown>): UsageEventRecord {
  return {
    id: String(row.id),
    tenant_id: asNullableString(row.tenant_id),
    user_id: asNullableString(row.user_id),
    run_id: asNullableString(row.run_id),
    thread_id: asNullableString(row.thread_id),
    request_id: asNullableString(row.request_id),
    agent_id: asNullableString(row.agent_id),
    action_id: asNullableString(row.action_id),
    feature: String(row.feature) as UsageEventRecord["feature"],
    model_id: String(row.model_id),
    input_tokens: asNumber(row.input_tokens),
    output_tokens: asNumber(row.output_tokens),
    cached_tokens: asNumber(row.cached_tokens),
    reasoning_tokens: asNumber(row.reasoning_tokens),
    pricing_version_id: asNullableString(row.pricing_version_id),
    input_per_mtok_micros: asNumber(row.input_per_mtok_micros),
    output_per_mtok_micros: asNumber(row.output_per_mtok_micros),
    cached_input_per_mtok_micros: asNumber(row.cached_input_per_mtok_micros),
    reasoning_per_mtok_micros: asNumber(row.reasoning_per_mtok_micros),
    cost_micros: asNumber(row.cost_micros),
    currency: String(row.currency ?? "usd"),
    occurred_at: String(row.occurred_at),
    created_at: String(row.created_at),
  };
}

function mapPeriodTotals(row: Record<string, unknown>): UsagePeriodTotalRecord {
  return {
    tenant_id: String(row.tenant_id),
    user_id: String(row.user_id),
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    input_tokens: asNumber(row.input_tokens),
    output_tokens: asNumber(row.output_tokens),
    cached_tokens: asNumber(row.cached_tokens),
    reasoning_tokens: asNumber(row.reasoning_tokens),
    cost_micros: asNumber(row.cost_micros),
    currency: String(row.currency ?? "usd"),
    event_count: asNumber(row.event_count),
    last_event_at: asNullableString(row.last_event_at),
    updated_at: String(row.updated_at),
  };
}

function emptyModelSummary(row: Record<string, unknown>) {
  return {
    model_id: String(row.model_id),
    feature: String(row.feature),
    input_tokens: 0,
    output_tokens: 0,
    cached_tokens: 0,
    reasoning_tokens: 0,
    cost_micros: 0,
    event_count: 0,
  };
}

export function createAiUsageStore(
  source: DbSource
): AiUsageStore & AiGatewayModelStore {
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): tenant-keyed tables
  // (ai.usage_event, ai.usage_period_total, ai.tenant_usage_policy,
  // ai.user_usage_policy) resolve a tenant-locked handle per call. The
  // SERVICE client remains for the global platform tables — ai.model_pricing,
  // ai.model, ai.gateway_model_sync_run, ai.gateway_model_sync_settings,
  // ai.model_binding have NO tenant_id column, so the tenant lane has no
  // grants on them (fail-closed) — plus the two commented cross-tenant reads.
  const { forTenant, service } = normalizeDbSource(source);
  const dbFor = (tenantId: string) => forTenant(tenantId).schema(AI_SCHEMA);
  const serviceDb = service.schema(AI_SCHEMA);
  const coreDb = service.schema("core");
  const pricing = () => serviceDb.from("model_pricing");
  const gatewayModels = () => serviceDb.from("model");
  const gatewayModelSyncRuns = () => serviceDb.from("gateway_model_sync_run");
  const gatewayModelSyncSettings = () =>
    serviceDb.from("gateway_model_sync_settings");
  const events = (tenantId: string) => dbFor(tenantId).from("usage_event");
  const totals = (tenantId: string) =>
    dbFor(tenantId).from("usage_period_total");
  const modelBindings = () => serviceDb.from("model_binding");
  const tenantPolicies = (tenantId: string) =>
    dbFor(tenantId).from("tenant_usage_policy");
  const userPolicies = (tenantId: string) =>
    dbFor(tenantId).from("user_usage_policy");

  return {
    async listModelBindings(scope = "platform") {
      const { data, error } = await modelBindings()
        .select("*")
        .eq("scope", scope)
        .order("role", { ascending: true });
      if (error) {
        throw new Error(`Failed to list model bindings: ${error.message}`);
      }
      return (data ?? []) as ModelBindingRecord[];
    },

    async seedModelBindings(rows) {
      if (rows.length === 0) {
        return 0;
      }
      // `ignoreDuplicates` is the whole contract: seeding must never overwrite a
      // role an operator has already bound. Re-running it on every boot is
      // therefore safe, which is what lets a new role ship without a migration.
      const { data, error } = await modelBindings()
        .upsert(rows as unknown as Record<string, unknown>[], {
          onConflict: "scope,role",
          ignoreDuplicates: true,
        })
        .select("role");
      if (error) {
        throw new Error(`Failed to seed model bindings: ${error.message}`);
      }
      return (data ?? []).length;
    },

    async upsertModelBinding(row) {
      const { data, error } = await modelBindings()
        .upsert(
          { ...row, updated_at: new Date().toISOString() },
          { onConflict: "scope,role" }
        )
        .select("*")
        .single();
      if (error) {
        throw new Error(`Failed to bind role ${row.role}: ${error.message}`);
      }
      return data as ModelBindingRecord;
    },

    async getActiveModelPricing(params) {
      const { data, error } = await pricing()
        .select("*")
        .eq("model_id", params.model_id)
        .lte("valid_from", params.at)
        .order("valid_from", { ascending: false })
        .limit(1);
      if (error) {
        throw new Error(`usage pricing select: ${error.message}`);
      }
      const row = (data ?? [])[0];
      if (!row) {
        return null;
      }
      const mapped = mapPricing(row as Record<string, unknown>);
      return mapped.valid_to && new Date(mapped.valid_to) <= new Date(params.at)
        ? null
        : mapped;
    },

    async getPeriodTotals(params) {
      const { data, error } = await totals(params.tenant_id)
        .select("*")
        .eq("tenant_id", params.tenant_id)
        .eq("user_id", params.user_id)
        .eq("period_start", params.period_start)
        .maybeSingle();
      if (error) {
        throw new Error(`usage totals select: ${error.message}`);
      }
      return data ? mapPeriodTotals(data as Record<string, unknown>) : null;
    },

    async getAgentPeriodCostMicros(params) {
      const { data, error } = await events(params.tenant_id)
        .select("cost_micros")
        .eq("tenant_id", params.tenant_id)
        .eq("agent_id", params.agent_id)
        .gte("occurred_at", params.period_start);
      if (error) {
        throw new Error(`agent usage cost select: ${error.message}`);
      }
      return (data ?? []).reduce(
        (sum, row) =>
          sum + Number((row as { cost_micros?: number }).cost_micros ?? 0),
        0
      );
    },

    async getTenantPolicy(tenantId) {
      const { data, error } = await tenantPolicies(tenantId)
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        throw new Error(`tenant usage policy select: ${error.message}`);
      }
      return data ? mapTenantPolicy(data as Record<string, unknown>) : null;
    },

    async getUserPolicy(params) {
      const { data, error } = await userPolicies(params.tenant_id)
        .select("*")
        .eq("tenant_id", params.tenant_id)
        .eq("user_id", params.user_id)
        .maybeSingle();
      if (error) {
        throw new Error(`user usage policy select: ${error.message}`);
      }
      return data ? mapUserPolicy(data as Record<string, unknown>) : null;
    },

    async insertEvent(input) {
      // Tenant events ride the tenant lane. The rare tenant-less event
      // (platform-lane usage with no tenant dimension; tenant_id is nullable
      // in the contract) keeps the SERVICE client — a NULL tenant_id can
      // never pass the srv_tenant_isolation WITH CHECK.
      const table = input.tenant_id
        ? events(input.tenant_id)
        : serviceDb.from("usage_event");
      const { data, error } = await table.insert(input).select("*").single();
      if (error) {
        throw new Error(`usage event insert: ${error.message}`);
      }
      return mapEvent(data as Record<string, unknown>);
    },

    async bumpPeriodTotals(input) {
      const { error } = await dbFor(input.tenant_id).rpc(
        "bump_usage_period_total",
        {
          p_tenant_id: input.tenant_id,
          p_user_id: input.user_id,
          p_period_start: input.period_start,
          p_period_end: input.period_end,
          p_input_tokens: input.input_tokens,
          p_output_tokens: input.output_tokens,
          p_cached_tokens: input.cached_tokens,
          p_reasoning_tokens: input.reasoning_tokens,
          p_cost_micros: input.cost_micros,
          p_currency: input.currency,
          p_occurred_at: input.occurred_at,
        }
      );
      if (error) {
        throw new Error(`usage totals bump: ${error.message}`);
      }
    },

    async insertModelPricing(record) {
      const { data, error } = await pricing()
        .insert(record)
        .select("*")
        .single();
      if (error) {
        throw new Error(`usage pricing insert: ${error.message}`);
      }
      return mapPricing(data as Record<string, unknown>);
    },

    async listModelPricing() {
      const { data, error } = await pricing()
        .select("*")
        .order("valid_from", { ascending: false });
      if (error) {
        throw new Error(`usage pricing list: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        mapPricing(row as Record<string, unknown>)
      );
    },

    async listUsedModelPricing() {
      // SERVICE lane (Phase A residual): superadmin diagnostics — which
      // pricing versions any tenant's events reference. Cross-tenant by
      // design; the pricing rows themselves are global platform data.
      const { data: eventRows, error: eventError } = await serviceDb
        .from("usage_event")
        .select("pricing_version_id");
      if (eventError) {
        throw new Error(`used pricing event list: ${eventError.message}`);
      }
      const pricingIds = [
        ...new Set(
          ((eventRows ?? []) as Record<string, unknown>[])
            .map((row) => asNullableString(row.pricing_version_id))
            .filter((value): value is string => !!value)
        ),
      ];
      if (pricingIds.length === 0) {
        return [];
      }
      const { data, error } = await pricing()
        .select("*")
        .in("id", pricingIds)
        .order("valid_from", { ascending: false });
      if (error) {
        throw new Error(`used pricing list: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        mapPricing(row as Record<string, unknown>)
      );
    },

    async listGatewayModels(filters = {}) {
      let query = gatewayModels()
        .select("*")
        .order("provider", { ascending: true })
        .order("model_id", { ascending: true });
      const search = filters.search?.trim();
      if (search) {
        query = query.or(
          [
            `model_id.ilike.%${search}%`,
            `display_name.ilike.%${search}%`,
            `description.ilike.%${search}%`,
          ].join(",")
        );
      }
      if (filters.gateway) {
        query = query.eq("gateway", filters.gateway);
      }
      if (filters.provider) {
        query = query.eq("provider", filters.provider);
      }
      if (filters.use_case) {
        query = query.contains("use_cases", [filters.use_case]);
      }
      if (filters.price_tier) {
        query = query.eq("price_tier", filters.price_tier);
      }
      if (filters.max_price_tier) {
        const tierOrder = [
          "cheap",
          "low",
          "medium",
          "high",
          "expensive",
        ] as const;
        query = query.in(
          "price_tier",
          tierOrder.slice(0, tierOrder.indexOf(filters.max_price_tier) + 1)
        );
      }
      if (filters.max_output_per_mtok_micros != null) {
        query = query.lte(
          "output_per_mtok_micros",
          filters.max_output_per_mtok_micros
        );
      }
      if (filters.availability_purpose) {
        query = query.eq(
          availabilityColumnForPurpose(filters.availability_purpose),
          true
        );
      }
      if (filters.web_search === true) {
        query = query.contains("tags", ["web-search"]);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(`gateway model list: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        mapGatewayModel(row as Record<string, unknown>)
      );
    },

    async upsertGatewayModels(models) {
      if (models.length === 0) {
        return 0;
      }
      const existingAvailability = new Map<
        string,
        GatewayModelAvailabilityFlags
      >();
      for (const modelIdBatch of chunkGatewayModelBatch(
        models.map((model) => model.model_id)
      )) {
        const { data: existingRows, error: existingError } =
          await gatewayModels()
            .select(GATEWAY_MODEL_AVAILABILITY_SELECT)
            .in("model_id", modelIdBatch);
        if (existingError) {
          throw new Error(
            `gateway model existing availability select: ${existingError.message}`
          );
        }
        for (const row of (existingRows ?? []) as unknown as Record<
          string,
          unknown
        >[]) {
          const [key, flags] = mapGatewayModelAvailabilityRow(row);
          existingAvailability.set(key, flags);
        }
      }

      let upserted = 0;
      for (const modelBatch of chunkGatewayModelBatch(models)) {
        const { data, error } = await gatewayModels()
          .upsert(
            modelBatch.map((model) =>
              preserveExistingAvailability(
                model,
                existingAvailability.get(gatewayModelKey(model))
              )
            ),
            { onConflict: "gateway,model_id" }
          )
          .select("model_id");
        if (error) {
          throw new Error(`gateway model upsert: ${error.message}`);
        }
        upserted += data?.length ?? 0;
      }
      return upserted;
    },

    async updateGatewayModelAvailability(modelId, patch, gateway) {
      let query = gatewayModels().update(patch).eq("model_id", modelId);
      if (gateway) {
        query = query.eq("gateway", gateway);
      }
      // Not `.single()`: without a gateway this patches the id on every gateway
      // serving it, and returning the first row keeps the caller's contract.
      const { data, error } = await query.select("*");
      if (error) {
        throw new Error(`gateway model availability update: ${error.message}`);
      }
      const row = (data ?? [])[0];
      if (!row) {
        throw new Error(`gateway model not found: ${modelId}`);
      }
      return mapGatewayModel(row as Record<string, unknown>);
    },

    async insertGatewayModelSyncRun(input) {
      const { data, error } = await gatewayModelSyncRuns()
        .insert(input)
        .select("*")
        .single();
      if (error) {
        throw new Error(`gateway model sync run insert: ${error.message}`);
      }
      return mapGatewayModelSyncRun(data as Record<string, unknown>);
    },

    async updateGatewayModelSyncRun(id, patch) {
      const { data, error } = await gatewayModelSyncRuns()
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        throw new Error(`gateway model sync run update: ${error.message}`);
      }
      return mapGatewayModelSyncRun(data as Record<string, unknown>);
    },

    async listGatewayModelSyncRuns(limit) {
      const { data, error } = await gatewayModelSyncRuns()
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`gateway model sync run list: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        mapGatewayModelSyncRun(row as Record<string, unknown>)
      );
    },

    async getGatewayModelSyncSettings() {
      const { data, error } = await gatewayModelSyncSettings()
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (error) {
        throw new Error(`gateway model sync settings select: ${error.message}`);
      }
      return data
        ? mapGatewayModelSyncSettings(data as Record<string, unknown>)
        : null;
    },

    async markGatewayModelSyncSettingsRun(successAt) {
      const patch: Record<string, unknown> = {
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (successAt) {
        patch.last_success_at = successAt;
      }
      const { error } = await gatewayModelSyncSettings()
        .update(patch)
        .eq("id", "default");
      if (error) {
        throw new Error(`gateway model sync settings update: ${error.message}`);
      }
    },

    async listUserPolicies(tenantId) {
      const { data, error } = await userPolicies(tenantId)
        .select("*")
        .eq("tenant_id", tenantId);
      if (error) {
        throw new Error(`user usage policy list: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        mapUserPolicy(row as Record<string, unknown>)
      );
    },

    async summarizeUsageByModel(params) {
      let query = events(params.tenant_id)
        .select(
          "model_id, feature, input_tokens, output_tokens, cached_tokens, reasoning_tokens, cost_micros"
        )
        .eq("tenant_id", params.tenant_id)
        .gte("occurred_at", params.period_start)
        .lt("occurred_at", params.period_end);
      if (params.user_id) {
        query = query.eq("user_id", params.user_id);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(`usage summary by model select: ${error.message}`);
      }
      const grouped = new Map<string, ReturnType<typeof emptyModelSummary>>();
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const key = `${String(row.model_id)}\u0000${String(row.feature)}`;
        const summary = grouped.get(key) ?? emptyModelSummary(row);
        summary.input_tokens += asNumber(row.input_tokens);
        summary.output_tokens += asNumber(row.output_tokens);
        summary.cached_tokens += asNumber(row.cached_tokens);
        summary.reasoning_tokens += asNumber(row.reasoning_tokens);
        summary.cost_micros += asNumber(row.cost_micros);
        summary.event_count += 1;
        grouped.set(key, summary);
      }
      return [...grouped.values()].sort(
        (a, b) =>
          b.cost_micros - a.cost_micros ||
          b.event_count - a.event_count ||
          a.model_id.localeCompare(b.model_id) ||
          a.feature.localeCompare(b.feature)
      );
    },

    async listUsageEventsByThread(params) {
      // Oldest first: the drill-in reads as a timeline of model calls, and the
      // interesting movement (each call re-sending a bigger prompt) only shows
      // up in that direction. Capped because a long agentic thread can record
      // hundreds of events and the panel plots every one of them.
      const limit = params.limit ?? 200;
      const { data, error } = await events(params.tenant_id)
        .select("*")
        .eq("tenant_id", params.tenant_id)
        .eq("thread_id", params.thread_id)
        .order("occurred_at", { ascending: true })
        .limit(limit);
      if (error) {
        throw new Error(`usage events by thread select: ${error.message}`);
      }
      return ((data ?? []) as Record<string, unknown>[]).map(mapEvent);
    },

    async summarizeUsageByThread(params) {
      const { data, error } = await events(params.tenant_id)
        .select(
          "input_tokens, output_tokens, cached_tokens, reasoning_tokens, cost_micros, currency"
        )
        .eq("tenant_id", params.tenant_id)
        .eq("thread_id", params.thread_id);
      if (error) {
        throw new Error(`usage summary by thread select: ${error.message}`);
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      if (rows.length === 0) {
        return null;
      }
      const summary = {
        cached_tokens: 0,
        cost_micros: 0,
        currency: "usd",
        event_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
      };
      for (const row of rows) {
        summary.input_tokens += asNumber(row.input_tokens);
        summary.output_tokens += asNumber(row.output_tokens);
        summary.cached_tokens += asNumber(row.cached_tokens);
        summary.reasoning_tokens += asNumber(row.reasoning_tokens);
        summary.cost_micros += asNumber(row.cost_micros);
        summary.event_count += 1;
        const currency = asNullableString(row.currency);
        if (currency) {
          summary.currency = currency;
        }
      }
      return summary;
    },

    async summarizeUsageByUser(params) {
      const { data, error } = await events(params.tenant_id)
        .select(
          "user_id, input_tokens, output_tokens, cached_tokens, reasoning_tokens, cost_micros"
        )
        .eq("tenant_id", params.tenant_id)
        .gte("occurred_at", params.period_start)
        .lt("occurred_at", params.period_end);
      if (error) {
        throw new Error(`usage summary by user select: ${error.message}`);
      }
      const grouped = new Map<
        string,
        {
          user_id: string | null;
          user_display_name: string | null;
          user_email: string | null;
          input_tokens: number;
          output_tokens: number;
          cached_tokens: number;
          reasoning_tokens: number;
          cost_micros: number;
          event_count: number;
        }
      >();
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const userId = asNullableString(row.user_id);
        const key = userId ?? "__null__";
        const summary = grouped.get(key) ?? {
          user_id: userId,
          user_display_name: null,
          user_email: null,
          input_tokens: 0,
          output_tokens: 0,
          cached_tokens: 0,
          reasoning_tokens: 0,
          cost_micros: 0,
          event_count: 0,
        };
        summary.input_tokens += asNumber(row.input_tokens);
        summary.output_tokens += asNumber(row.output_tokens);
        summary.cached_tokens += asNumber(row.cached_tokens);
        summary.reasoning_tokens += asNumber(row.reasoning_tokens);
        summary.cost_micros += asNumber(row.cost_micros);
        summary.event_count += 1;
        grouped.set(key, summary);
      }

      const userIds = [...grouped.values()]
        .map((row) => row.user_id)
        .filter((value): value is string => !!value);
      if (userIds.length > 0) {
        // SERVICE lane: core.users is the global user table (no tenant_id
        // column → no tenant-lane grants). Only ids already present in this
        // tenant's usage events are looked up.
        const { data: users, error: usersError } = await coreDb
          .from("users")
          .select("id, email, display_name")
          .in("id", userIds);
        if (usersError) {
          throw new Error(`usage summary users select: ${usersError.message}`);
        }
        for (const row of (users ?? []) as Record<string, unknown>[]) {
          const summary = grouped.get(String(row.id));
          if (!summary) {
            continue;
          }
          summary.user_email = asNullableString(row.email);
          summary.user_display_name = asNullableString(row.display_name);
        }
      }

      return [...grouped.values()].sort(
        (a, b) =>
          b.cost_micros - a.cost_micros ||
          b.event_count - a.event_count ||
          (a.user_email ?? a.user_id ?? "").localeCompare(
            b.user_email ?? b.user_id ?? ""
          )
      );
    },

    async upsertTenantPolicy(record) {
      const { data, error } = await tenantPolicies(record.tenant_id)
        .upsert(record, { onConflict: "tenant_id" })
        .select("*")
        .single();
      if (error) {
        throw new Error(`tenant usage policy upsert: ${error.message}`);
      }
      return mapTenantPolicy(data as Record<string, unknown>);
    },

    async upsertUserPolicy(record) {
      const { data, error } = await userPolicies(record.tenant_id)
        .upsert(record, { onConflict: "tenant_id,user_id" })
        .select("*")
        .single();
      if (error) {
        throw new Error(`user usage policy upsert: ${error.message}`);
      }
      return mapUserPolicy(data as Record<string, unknown>);
    },
  };
}
