// CRUD for ai.routine_state — per-tenant routine enable/override + last-run
// bookkeeping. Definitions stay in code; this table only holds state.
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";

const logger = createLogger({ name: "routine-state-store" });

export interface RoutineStateRow {
  enabled: boolean;
  last_result: string | null;
  last_run_at: string | null;
  routine_id: string;
  schedule_override: string | null;
  tenant_id: string;
}

export interface RoutineStateStore {
  listStates(tenantId: string): Promise<RoutineStateRow[]>;
  recordRun(params: {
    lastResult: string;
    routineId: string;
    tenantId: string;
  }): Promise<void>;
  upsertState(params: {
    enabled?: boolean;
    routineId: string;
    scheduleOverride?: string | null;
    tenantId: string;
  }): Promise<RoutineStateRow | null>;
}

export function createRoutineStateStore(db: SupabaseClient): RoutineStateStore {
  return {
    async listStates(tenantId) {
      const { data, error } = await db
        .schema("ai")
        .from("routine_state")
        .select("*")
        .eq("tenant_id", tenantId);
      if (error) {
        logger.warn("listStates failed", { err: error.message });
        return [];
      }
      return (data ?? []) as RoutineStateRow[];
    },

    async recordRun({ lastResult, routineId, tenantId }) {
      const { error } = await db
        .schema("ai")
        .from("routine_state")
        .upsert(
          {
            last_result: lastResult.slice(0, 2000),
            last_run_at: new Date().toISOString(),
            routine_id: routineId,
            tenant_id: tenantId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,routine_id" }
        );
      if (error) {
        logger.warn("recordRun failed", { routineId, err: error.message });
      }
    },

    async upsertState({ enabled, routineId, scheduleOverride, tenantId }) {
      const patch: Record<string, unknown> = {
        routine_id: routineId,
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      };
      if (enabled !== undefined) {
        patch.enabled = enabled;
      }
      if (scheduleOverride !== undefined) {
        patch.schedule_override = scheduleOverride;
      }
      const { data, error } = await db
        .schema("ai")
        .from("routine_state")
        .upsert(patch, { onConflict: "tenant_id,routine_id" })
        .select("*")
        .single();
      if (error) {
        logger.warn("upsertState failed", { routineId, err: error.message });
        return null;
      }
      return data as RoutineStateRow;
    },
  };
}
