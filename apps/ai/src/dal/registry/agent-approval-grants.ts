// DAL for `ai.agent_approval_grants` — operations an agent may run without
// asking ("Für diesen Agent erlauben" on an approval card).
//
// Keyed on the registry agent key, not on a thread or user: one approval
// covers every later run of that agent — any user's chat, its routines, its
// tasks. The operation id is the exact grant id the gates check.
import {
  createDbSourceFromEnv,
  type DbSource,
  normalizeDbSource,
} from "../../infra/tenant-db.js";

const SCHEMA = "ai";
const TABLE = "agent_approval_grants";

export function createAgentApprovalGrantStore(source: DbSource) {
  const { forTenant } = normalizeDbSource(source);
  const dbFor = (tenantId: string) => forTenant(tenantId).schema(SCHEMA);
  return {
    async add(input: {
      agentId: string;
      grantedBy?: string | null;
      operationIds: readonly string[];
      tenantId: string;
    }): Promise<void> {
      if (input.operationIds.length === 0) {
        return;
      }
      const { error } = await dbFor(input.tenantId)
        .from(TABLE)
        .upsert(
          input.operationIds.map((operationId) => ({
            agent_id: input.agentId,
            granted_by: input.grantedBy ?? null,
            operation_id: operationId,
            tenant_id: input.tenantId,
          })),
          {
            ignoreDuplicates: true,
            onConflict: "tenant_id,agent_id,operation_id",
          }
        );
      if (error) {
        throw new Error(`agentApprovalGrants.add: ${error.message}`);
      }
    },

    async list(input: {
      agentId: string;
      tenantId: string;
    }): Promise<string[]> {
      const { data, error } = await dbFor(input.tenantId)
        .from(TABLE)
        .select("operation_id")
        .eq("tenant_id", input.tenantId)
        .eq("agent_id", input.agentId);
      if (error) {
        throw new Error(`agentApprovalGrants.list: ${error.message}`);
      }
      return ((data ?? []) as { operation_id: string }[]).map(
        (row) => row.operation_id
      );
    },
  };
}

export type AgentApprovalGrantStore = ReturnType<
  typeof createAgentApprovalGrantStore
>;

export function createAgentApprovalGrantStoreFromEnv(): AgentApprovalGrantStore | null {
  const source = createDbSourceFromEnv();
  return source ? createAgentApprovalGrantStore(source) : null;
}
