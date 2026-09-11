// DAL for `ai.routines` — the standing arrangement on a mounted specialist.
//
// A routine names a workflow (`ai.workflow`) and carries behaviour: the
// outcome promise, reporting, quiet hours, the unattended allow-list and the
// static input. Its wake sources are child rows in `ai.routine_triggers`
// (see routine-trigger-store.ts) — a routine has 1..n and this store never
// touches them.
//
// Firing is NOT here — a fire starts a Run through the same dispatcher a button
// press uses (`ai/workflows/dispatch-published-run.ts`). This store only
// owns the record.
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";

const SCHEMA = "ai";
const TABLE = "routines";

export type RoutineSource = "custom" | "module";
export type RoutineReport = "quiet" | "desk_card" | "ask";

export interface RoutineRow {
  agent_id: string;
  approval_grants: string[];
  created_at: string;
  created_by_user_id: string | null;
  declaration_id: string | null;
  description: string | null;
  enabled: boolean;
  id: string;
  last_fired_at: string | null;
  last_result: string | null;
  module_id: string | null;
  name: string;
  outcome: string | null;
  quiet_hours: string | null;
  report: RoutineReport;
  source: RoutineSource;
  space_id: string | null;
  tenant_id: string;
  updated_at: string;
  /** The bound workflow (`ai.workflow.id`). Required — decision A. */
  workflow_id: string;
  /** Static input the fire supplies to the workflow. */
  workflow_input: Record<string, unknown>;
}

export interface CreateRoutineInput {
  agentId: string;
  approvalGrants?: string[];
  createdByUserId?: string | null;
  declarationId?: string | null;
  description?: string | null;
  enabled?: boolean;
  id?: string;
  moduleId?: string | null;
  name: string;
  outcome?: string | null;
  quietHours?: string | null;
  report?: RoutineReport;
  source?: RoutineSource;
  spaceId?: string | null;
  tenantId: string;
  workflowId: string;
  workflowInput?: Record<string, unknown>;
}

export interface UpdateRoutineInput {
  agentId?: string;
  approvalGrants?: string[];
  description?: string | null;
  enabled?: boolean;
  /** The row's status line; `recordFire` is the write that also stamps the fire time. */
  lastResult?: string | null;
  name?: string;
  outcome?: string | null;
  quietHours?: string | null;
  report?: RoutineReport;
  workflowId?: string;
  workflowInput?: Record<string, unknown>;
}

export interface ListRoutinesInput {
  agentId?: string;
  enabled?: boolean;
  source?: RoutineSource;
  spaceId?: string | null;
  tenantId: string;
}

export interface RoutineStore {
  create(input: CreateRoutineInput): Promise<RoutineRow>;
  delete(input: { id: string; tenantId: string }): Promise<void>;
  get(input: { id: string; tenantId: string }): Promise<RoutineRow | null>;
  /** Reconcile lookup for a module trigger declaration. */
  getByDeclaration(input: {
    declarationId: string;
    tenantId: string;
  }): Promise<RoutineRow | null>;
  list(input: ListRoutinesInput): Promise<RoutineRow[]>;
  /** Every tenant that owns at least one routine — drives the boot sweep. */
  listTenantIds(): Promise<string[]>;
  recordFire(input: {
    firedAt?: string;
    id: string;
    result: string;
    tenantId: string;
  }): Promise<void>;
  update(
    input: UpdateRoutineInput & { id: string; tenantId: string }
  ): Promise<RoutineRow>;
}

/** Only send what the caller actually set — an absent key must not null a column. */
function patchFromInput(input: UpdateRoutineInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const map: [keyof UpdateRoutineInput, string][] = [
    ["workflowInput", "workflow_input"],
    ["agentId", "agent_id"],
    ["approvalGrants", "approval_grants"],
    ["description", "description"],
    ["enabled", "enabled"],
    ["lastResult", "last_result"],
    ["name", "name"],
    ["outcome", "outcome"],
    ["quietHours", "quiet_hours"],
    ["report", "report"],
    ["workflowId", "workflow_id"],
  ];
  for (const [key, column] of map) {
    if (input[key] !== undefined) {
      patch[column] = input[key];
    }
  }
  return patch;
}

export function createRoutineStore(source: DbSource): RoutineStore {
  const { forTenant, service } = normalizeDbSource(source);
  const table = (tenantId: string) =>
    forTenant(tenantId).schema(SCHEMA).from(TABLE);

  return {
    async create(input) {
      const { data, error } = await table(input.tenantId)
        .insert({
          workflow_input: input.workflowInput ?? {},
          agent_id: input.agentId,
          approval_grants: input.approvalGrants ?? [],
          created_by_user_id: input.createdByUserId ?? null,
          declaration_id: input.declarationId ?? null,
          description: input.description ?? null,
          enabled: input.enabled ?? true,
          ...(input.id ? { id: input.id } : {}),
          module_id: input.moduleId ?? null,
          name: input.name,
          outcome: input.outcome ?? null,
          quiet_hours: input.quietHours ?? null,
          report: input.report ?? "desk_card",
          source: input.source ?? "custom",
          space_id: input.spaceId ?? null,
          tenant_id: input.tenantId,
          workflow_id: input.workflowId,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`routines create: ${error.message}`);
      }
      return data as RoutineRow;
    },

    async delete(input) {
      const { error } = await table(input.tenantId)
        .delete()
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);
      if (error) {
        throw new Error(`routines delete: ${error.message}`);
      }
    },

    async get(input) {
      const { data, error } = await table(input.tenantId)
        .select()
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      if (error) {
        throw new Error(`routines get: ${error.message}`);
      }
      return (data as RoutineRow | null) ?? null;
    },

    async getByDeclaration(input) {
      const { data, error } = await table(input.tenantId)
        .select()
        .eq("tenant_id", input.tenantId)
        .eq("declaration_id", input.declarationId)
        .maybeSingle();
      if (error) {
        throw new Error(`routines getByDeclaration: ${error.message}`);
      }
      return (data as RoutineRow | null) ?? null;
    },

    async list(input) {
      let q = table(input.tenantId).select().eq("tenant_id", input.tenantId);
      if (input.agentId) {
        q = q.eq("agent_id", input.agentId);
      }
      if (input.source) {
        q = q.eq("source", input.source);
      }
      if (input.enabled !== undefined) {
        q = q.eq("enabled", input.enabled);
      }
      // `spaceId: null` is a real filter (routines outside any Space), so only
      // an absent key means "every Space".
      if (input.spaceId !== undefined) {
        q =
          input.spaceId === null
            ? q.is("space_id", null)
            : q.eq("space_id", input.spaceId);
      }
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) {
        throw new Error(`routines list: ${error.message}`);
      }
      return (data ?? []) as RoutineRow[];
    },

    async listTenantIds() {
      // Cross-tenant by design: the boot sweep runs before any tenant context
      // exists, so it uses the service handle. The ONLY method here that does —
      // everything else is tenant-locked.
      const { data, error } = await service
        .schema(SCHEMA)
        .from(TABLE)
        .select("tenant_id");
      if (error) {
        throw new Error(`routines listTenantIds: ${error.message}`);
      }
      const rows = (data ?? []) as { tenant_id: string }[];
      return [...new Set(rows.map((row) => row.tenant_id))];
    },

    async recordFire(input) {
      const { error } = await table(input.tenantId)
        .update({
          last_fired_at: input.firedAt ?? new Date().toISOString(),
          last_result: input.result.slice(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);
      if (error) {
        throw new Error(`routines recordFire: ${error.message}`);
      }
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
        throw new Error(`routines update: ${error.message}`);
      }
      return data as RoutineRow;
    },
  };
}
