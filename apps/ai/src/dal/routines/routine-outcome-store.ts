// DAL for `ai.routine_outcomes` — destinations a routine fire delivers to.
//
// A routine has 0..n of these. Zero rows keeps the legacy `report` desk post.
// Rows replace that post. Config is standing and validated at write time
// against the provider's config schema; the run cannot change it.
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";

const SCHEMA = "ai";
const TABLE = "routine_outcomes";

export type RoutineOutcomeMode = "always" | "agent";

export interface RoutineOutcomeRow {
  config: Record<string, unknown>;
  created_at: string;
  enabled: boolean;
  id: string;
  mode: RoutineOutcomeMode;
  provider_id: string;
  routine_id: string;
  tenant_id: string;
  updated_at: string;
}

export interface CreateRoutineOutcomeInput {
  config?: Record<string, unknown>;
  enabled?: boolean;
  id?: string;
  mode: RoutineOutcomeMode;
  providerId: string;
  routineId: string;
  tenantId: string;
}

export interface UpdateRoutineOutcomeInput {
  config?: Record<string, unknown>;
  enabled?: boolean;
  mode?: RoutineOutcomeMode;
  providerId?: string;
}

export interface ListRoutineOutcomesInput {
  enabled?: boolean;
  mode?: RoutineOutcomeMode;
  routineId?: string;
  tenantId: string;
}

export interface RoutineOutcomeStore {
  create(input: CreateRoutineOutcomeInput): Promise<RoutineOutcomeRow>;
  delete(input: { id: string; tenantId: string }): Promise<void>;
  get(input: {
    id: string;
    tenantId: string;
  }): Promise<RoutineOutcomeRow | null>;
  list(input: ListRoutineOutcomesInput): Promise<RoutineOutcomeRow[]>;
  update(
    input: UpdateRoutineOutcomeInput & { id: string; tenantId: string }
  ): Promise<RoutineOutcomeRow>;
}

function patchFromInput(
  input: UpdateRoutineOutcomeInput
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.config !== undefined) {
    patch.config = input.config;
  }
  if (input.enabled !== undefined) {
    patch.enabled = input.enabled;
  }
  if (input.mode !== undefined) {
    patch.mode = input.mode;
  }
  if (input.providerId !== undefined) {
    patch.provider_id = input.providerId;
  }
  return patch;
}

export function createRoutineOutcomeStore(
  source: DbSource
): RoutineOutcomeStore {
  const { forTenant } = normalizeDbSource(source);
  const table = (tenantId: string) =>
    forTenant(tenantId).schema(SCHEMA).from(TABLE);

  return {
    async create(input) {
      const { data, error } = await table(input.tenantId)
        .insert({
          config: input.config ?? {},
          enabled: input.enabled ?? true,
          ...(input.id ? { id: input.id } : {}),
          mode: input.mode,
          provider_id: input.providerId,
          routine_id: input.routineId,
          tenant_id: input.tenantId,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`routine_outcomes create: ${error.message}`);
      }
      return data as RoutineOutcomeRow;
    },

    async delete(input) {
      const { error } = await table(input.tenantId)
        .delete()
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);
      if (error) {
        throw new Error(`routine_outcomes delete: ${error.message}`);
      }
    },

    async get(input) {
      const { data, error } = await table(input.tenantId)
        .select()
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      if (error) {
        throw new Error(`routine_outcomes get: ${error.message}`);
      }
      return (data as RoutineOutcomeRow | null) ?? null;
    },

    async list(input) {
      let q = table(input.tenantId).select().eq("tenant_id", input.tenantId);
      if (input.routineId) {
        q = q.eq("routine_id", input.routineId);
      }
      if (input.mode) {
        q = q.eq("mode", input.mode);
      }
      if (input.enabled !== undefined) {
        q = q.eq("enabled", input.enabled);
      }
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) {
        throw new Error(`routine_outcomes list: ${error.message}`);
      }
      return (data ?? []) as RoutineOutcomeRow[];
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
        throw new Error(`routine_outcomes update: ${error.message}`);
      }
      return data as RoutineOutcomeRow;
    },
  };
}
