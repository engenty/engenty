// DAL for `ai.routine_outcome_deliveries` — idempotency ledger.
//
// Unique on (run_id, outcome_id, idempotency_key). A replayed settle or a
// repeated outcomes_deliver call claims the same row instead of sending twice.
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";

const SCHEMA = "ai";
const TABLE = "routine_outcome_deliveries";

export type RoutineOutcomeDeliveryStatus = "pending" | "sent" | "failed";

export interface RoutineOutcomeDeliveryRow {
  created_at: string;
  error: string | null;
  id: string;
  idempotency_key: string;
  outcome_id: string;
  run_id: string;
  status: RoutineOutcomeDeliveryStatus;
  tenant_id: string;
  updated_at: string;
}

export interface RoutineOutcomeDeliveryStore {
  /**
   * Insert the pending claim. Unique violation returns the existing row
   * instead of throwing — the caller decides whether to skip or retry.
   */
  claim(input: {
    idempotencyKey: string;
    outcomeId: string;
    runId: string;
    tenantId: string;
  }): Promise<{ created: boolean; row: RoutineOutcomeDeliveryRow }>;
  listForRun(input: {
    runId: string;
    tenantId: string;
  }): Promise<RoutineOutcomeDeliveryRow[]>;
  mark(input: {
    error?: string | null;
    id: string;
    status: Exclude<RoutineOutcomeDeliveryStatus, "pending">;
    tenantId: string;
  }): Promise<RoutineOutcomeDeliveryRow>;
}

export function createRoutineOutcomeDeliveryStore(
  source: DbSource
): RoutineOutcomeDeliveryStore {
  const { forTenant } = normalizeDbSource(source);
  const table = (tenantId: string) =>
    forTenant(tenantId).schema(SCHEMA).from(TABLE);

  return {
    async claim(input) {
      const { data, error } = await table(input.tenantId)
        .insert({
          idempotency_key: input.idempotencyKey,
          outcome_id: input.outcomeId,
          run_id: input.runId,
          status: "pending",
          tenant_id: input.tenantId,
        })
        .select()
        .single();
      if (!error) {
        return { created: true, row: data as RoutineOutcomeDeliveryRow };
      }
      if (error.code !== "23505") {
        throw new Error(`routine_outcome_deliveries claim: ${error.message}`);
      }
      const { data: existing, error: readError } = await table(input.tenantId)
        .select()
        .eq("tenant_id", input.tenantId)
        .eq("run_id", input.runId)
        .eq("outcome_id", input.outcomeId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (readError) {
        throw new Error(
          `routine_outcome_deliveries claim read: ${readError.message}`
        );
      }
      if (!existing) {
        throw new Error(
          "routine_outcome_deliveries claim: unique conflict but the row was not found"
        );
      }
      return {
        created: false,
        row: existing as RoutineOutcomeDeliveryRow,
      };
    },

    async listForRun(input) {
      const { data, error } = await table(input.tenantId)
        .select()
        .eq("tenant_id", input.tenantId)
        .eq("run_id", input.runId)
        .order("created_at", { ascending: true });
      if (error) {
        throw new Error(
          `routine_outcome_deliveries listForRun: ${error.message}`
        );
      }
      return (data ?? []) as RoutineOutcomeDeliveryRow[];
    },

    async mark(input) {
      const { data, error } = await table(input.tenantId)
        .update({
          error: input.error ?? null,
          status: input.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId)
        .select()
        .single();
      if (error) {
        throw new Error(`routine_outcome_deliveries mark: ${error.message}`);
      }
      return data as RoutineOutcomeDeliveryRow;
    },
  };
}
