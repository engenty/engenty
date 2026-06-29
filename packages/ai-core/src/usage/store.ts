import type {
  ModelPricingRecord,
  TenantUsagePolicyRecord,
  UsageEventRecord,
  UsagePeriodTotalRecord,
  UserUsagePolicyRecord,
} from "./contracts.js";

export interface UsageEventInsert
  extends Omit<UsageEventRecord, "id" | "created_at"> {
  created_at?: string;
  id?: string;
}

export interface PeriodTotalsBumpInput {
  cached_tokens: number;
  cost_micros: number;
  currency: string;
  input_tokens: number;
  occurred_at: string;
  output_tokens: number;
  period_end: string;
  period_start: string;
  reasoning_tokens: number;
  tenant_id: string;
  user_id: string;
}

export interface AiUsageStore {
  /** Atomically increment the period-totals row for tenant or user (sentinel uuid for tenant). */
  bumpPeriodTotals(input: PeriodTotalsBumpInput): Promise<void>;

  /** Lookup the active pricing row for a model at a given timestamp. */
  getActiveModelPricing(params: {
    model_id: string;
    at: string;
  }): Promise<ModelPricingRecord | null>;

  /** Read the current period totals (tenant-aggregate or user) if present. */
  getPeriodTotals(params: {
    tenant_id: string;
    user_id: string;
    period_start: string;
  }): Promise<UsagePeriodTotalRecord | null>;

  /** Read tenant policy or null when no row exists. */
  getTenantPolicy(tenantId: string): Promise<TenantUsagePolicyRecord | null>;

  /** Read per-user override policy. */
  getUserPolicy(params: {
    tenant_id: string;
    user_id: string;
  }): Promise<UserUsagePolicyRecord | null>;
  /** Insert a new usage event row exactly once. */
  insertEvent(input: UsageEventInsert): Promise<UsageEventRecord>;

  /** Insert a new pricing row (versioning happens by valid_from). */
  insertModelPricing(
    record: Omit<ModelPricingRecord, "id" | "created_at"> & {
      id?: string;
      created_at?: string;
    }
  ): Promise<ModelPricingRecord>;

  /** List pricing catalog (most recent valid_from first). */
  listModelPricing(): Promise<ModelPricingRecord[]>;

  /** List pricing rows that are referenced by recorded usage events. */
  listUsedModelPricing(): Promise<ModelPricingRecord[]>;

  /** List per-user override rows for a tenant. */
  listUserPolicies(tenantId: string): Promise<UserUsagePolicyRecord[]>;

  /** Aggregated breakdown by model + feature in a window (for UI dashboards). */
  summarizeUsageByModel(params: {
    tenant_id: string;
    user_id?: string | null;
    period_start: string;
    period_end: string;
  }): Promise<
    Array<{
      model_id: string;
      feature: string;
      input_tokens: number;
      output_tokens: number;
      cached_tokens: number;
      reasoning_tokens: number;
      cost_micros: number;
      event_count: number;
    }>
  >;

  /** Cumulative usage for one copilot thread (all recorded events). */
  summarizeUsageByThread(params: {
    tenant_id: string;
    thread_id: string;
  }): Promise<{
    cached_tokens: number;
    cost_micros: number;
    currency: string;
    event_count: number;
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
  } | null>;

  /** Per-user totals in a window for tenant-admin dashboards. */
  summarizeUsageByUser(params: {
    tenant_id: string;
    period_start: string;
    period_end: string;
  }): Promise<
    Array<{
      user_id: string | null;
      user_display_name: string | null;
      user_email: string | null;
      input_tokens: number;
      output_tokens: number;
      cached_tokens: number;
      reasoning_tokens: number;
      cost_micros: number;
      event_count: number;
    }>
  >;

  /** Upsert tenant policy by tenant id. */
  upsertTenantPolicy(
    record: Omit<TenantUsagePolicyRecord, "created_at" | "updated_at"> & {
      created_at?: string;
      updated_at?: string;
    }
  ): Promise<TenantUsagePolicyRecord>;

  /** Upsert per-user override policy. */
  upsertUserPolicy(
    record: Omit<UserUsagePolicyRecord, "created_at" | "updated_at"> & {
      created_at?: string;
      updated_at?: string;
    }
  ): Promise<UserUsagePolicyRecord>;
}

const USAGE_STORE_KEY = Symbol.for("engenty.ai-core.aiUsageStore");

export function configureAiUsageStore(store: AiUsageStore | null): void {
  const target = globalThis as Record<PropertyKey, unknown>;
  target[USAGE_STORE_KEY] = store;
}

export function getAiUsageStore(): AiUsageStore | null {
  const target = globalThis as Record<PropertyKey, unknown>;
  const store = target[USAGE_STORE_KEY];
  return store ? (store as AiUsageStore) : null;
}
