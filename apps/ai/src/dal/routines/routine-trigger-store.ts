// DAL for `ai.routine_triggers` — one wake source of a routine.
//
// A routine has 1..n of these; the wake fields (cron, event, webhook secret,
// input mapping) live here and ONLY here. The routine row keeps behaviour
// (outcome, report, quiet hours) and the master `enabled`; a fire is allowed
// only when routine and trigger are both enabled — enforced by the callers,
// which always hold both rows.
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";

const SCHEMA = "ai";
const TABLE = "routine_triggers";

export type RoutineTriggerKind = "schedule" | "event" | "manual" | "agent";

export interface RoutineTriggerRow {
  created_at: string;
  cron: string | null;
  enabled: boolean;
  event_filter: Record<string, unknown> | null;
  id: string;
  input_mapping: Record<string, unknown> | null;
  kind: RoutineTriggerKind;
  provider_id: string | null;
  resource: string | null;
  routine_id: string;
  /** Derived Mastra schedule id — reconciled, never authored. */
  schedule_id: string | null;
  /** Manual kind: a short key a person can invoke the routine by. */
  shortcode: string | null;
  tenant_id: string;
  timezone: string | null;
  updated_at: string;
  webhook_secret: string | null;
}

export interface CreateRoutineTriggerInput {
  cron?: string | null;
  enabled?: boolean;
  eventFilter?: Record<string, unknown> | null;
  id?: string;
  inputMapping?: Record<string, unknown> | null;
  kind: RoutineTriggerKind;
  providerId?: string | null;
  resource?: string | null;
  routineId: string;
  shortcode?: string | null;
  tenantId: string;
  timezone?: string | null;
  webhookSecret?: string | null;
}

export interface UpdateRoutineTriggerInput {
  cron?: string | null;
  enabled?: boolean;
  eventFilter?: Record<string, unknown> | null;
  inputMapping?: Record<string, unknown> | null;
  kind?: RoutineTriggerKind;
  providerId?: string | null;
  resource?: string | null;
  /** Reconcile writes this; nothing else should. */
  scheduleId?: string | null;
  shortcode?: string | null;
  timezone?: string | null;
  webhookSecret?: string | null;
}

export interface ListRoutineTriggersInput {
  enabled?: boolean;
  kind?: RoutineTriggerKind;
  routineId?: string;
  tenantId: string;
}

export interface RoutineTriggerStore {
  create(input: CreateRoutineTriggerInput): Promise<RoutineTriggerRow>;
  delete(input: { id: string; tenantId: string }): Promise<void>;
  get(input: {
    id: string;
    tenantId: string;
  }): Promise<RoutineTriggerRow | null>;
  list(input: ListRoutineTriggersInput): Promise<RoutineTriggerRow[]>;
  /**
   * Resolve a webhook trigger from the routine id and secret in its URL.
   *
   * Cross-tenant by necessity: an inbound webhook carries no session, so the
   * trigger's own row is what names the tenant. The secret is the credential —
   * a wrong one finds nothing rather than reporting which half was wrong.
   */
  resolveWebhook(input: {
    routineId: string;
    secret: string;
  }): Promise<RoutineTriggerRow | null>;
  update(
    input: UpdateRoutineTriggerInput & { id: string; tenantId: string }
  ): Promise<RoutineTriggerRow>;
}

function patchFromInput(
  input: UpdateRoutineTriggerInput
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const map: [keyof UpdateRoutineTriggerInput, string][] = [
    ["cron", "cron"],
    ["enabled", "enabled"],
    ["eventFilter", "event_filter"],
    ["inputMapping", "input_mapping"],
    ["kind", "kind"],
    ["providerId", "provider_id"],
    ["resource", "resource"],
    ["scheduleId", "schedule_id"],
    ["shortcode", "shortcode"],
    ["timezone", "timezone"],
    ["webhookSecret", "webhook_secret"],
  ];
  for (const [key, column] of map) {
    if (input[key] !== undefined) {
      patch[column] = input[key];
    }
  }
  return patch;
}

export function createRoutineTriggerStore(
  source: DbSource
): RoutineTriggerStore {
  const { forTenant, service } = normalizeDbSource(source);
  const table = (tenantId: string) =>
    forTenant(tenantId).schema(SCHEMA).from(TABLE);

  return {
    async create(input) {
      const { data, error } = await table(input.tenantId)
        .insert({
          cron: input.cron ?? null,
          enabled: input.enabled ?? true,
          event_filter: input.eventFilter ?? null,
          ...(input.id ? { id: input.id } : {}),
          input_mapping: input.inputMapping ?? null,
          kind: input.kind,
          provider_id: input.providerId ?? null,
          resource: input.resource ?? null,
          routine_id: input.routineId,
          shortcode: input.shortcode ?? null,
          tenant_id: input.tenantId,
          timezone: input.timezone ?? null,
          webhook_secret: input.webhookSecret ?? null,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`routine_triggers create: ${error.message}`);
      }
      return data as RoutineTriggerRow;
    },

    async delete(input) {
      const { error } = await table(input.tenantId)
        .delete()
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);
      if (error) {
        throw new Error(`routine_triggers delete: ${error.message}`);
      }
    },

    async get(input) {
      const { data, error } = await table(input.tenantId)
        .select()
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      if (error) {
        throw new Error(`routine_triggers get: ${error.message}`);
      }
      return (data as RoutineTriggerRow | null) ?? null;
    },

    async list(input) {
      let q = table(input.tenantId).select().eq("tenant_id", input.tenantId);
      if (input.routineId) {
        q = q.eq("routine_id", input.routineId);
      }
      if (input.kind) {
        q = q.eq("kind", input.kind);
      }
      if (input.enabled !== undefined) {
        q = q.eq("enabled", input.enabled);
      }
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) {
        throw new Error(`routine_triggers list: ${error.message}`);
      }
      return (data ?? []) as RoutineTriggerRow[];
    },

    async resolveWebhook(input) {
      const secret = input.secret.trim();
      // An empty secret must never match a row whose column is empty too.
      if (!secret) {
        return null;
      }
      const { data, error } = await service
        .schema(SCHEMA)
        .from(TABLE)
        .select()
        .eq("routine_id", input.routineId)
        .eq("webhook_secret", secret)
        .eq("kind", "event")
        .eq("provider_id", "webhook")
        .maybeSingle();
      if (error) {
        throw new Error(`routine_triggers resolveWebhook: ${error.message}`);
      }
      return (data as RoutineTriggerRow | null) ?? null;
    },

    async update(input) {
      const patch = patchFromInput(input);
      patch.updated_at = new Date().toISOString();
      const { data, error } = await table(input.tenantId)
        .update(patch)
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId)
        .select()
        .single();
      if (error) {
        throw new Error(`routine_triggers update: ${error.message}`);
      }
      return data as RoutineTriggerRow;
    },
  };
}
