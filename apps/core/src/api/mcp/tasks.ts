export type McpTaskStatus =
  | "working"
  | "input_required"
  | "completed"
  | "failed"
  | "cancelled";

export interface McpTaskRecord {
  clientId: string;
  createdAt: string;
  error?: unknown;
  expiresAt: string;
  id: string;
  inputHash: string;
  operationId: string;
  result?: unknown;
  spaceId?: string;
  status: McpTaskStatus;
  tenantId: string;
  updatedAt: string;
  userId: string;
}

export interface McpTaskStore {
  cancel(id: string): Promise<McpTaskRecord | null>;
  create(record: McpTaskRecord): Promise<McpTaskRecord>;
  get(id: string): Promise<McpTaskRecord | null>;
  update(
    id: string,
    patch: Partial<Pick<McpTaskRecord, "error" | "result" | "status">>
  ): Promise<McpTaskRecord | null>;
}

export function createMemoryMcpTaskStore(): McpTaskStore {
  const rows = new Map<string, McpTaskRecord>();
  return {
    async create(record) {
      rows.set(record.id, record);
      return record;
    },
    async get(id) {
      const row = rows.get(id);
      if (!row) {
        return null;
      }
      if (Date.parse(row.expiresAt) <= Date.now()) {
        return { ...row, status: "failed", error: { code: "expired" } };
      }
      return row;
    },
    async update(id, patch) {
      const existing = rows.get(id);
      if (!existing) {
        return null;
      }
      const next = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      rows.set(id, next);
      return next;
    },
    async cancel(id) {
      return this.update(id, { status: "cancelled" });
    },
  };
}

export function assertTaskOwner(
  task: McpTaskRecord,
  params: { clientId: string; tenantId: string; userId: string }
): boolean {
  return (
    task.clientId === params.clientId &&
    task.tenantId === params.tenantId &&
    task.userId === params.userId
  );
}

interface McpTaskRow {
  client_id: string;
  created_at: string;
  error: unknown;
  expires_at: string;
  id: string;
  input_hash: string;
  operation_id: string;
  result: unknown;
  space_id: string | null;
  status: McpTaskStatus;
  tenant_id: string;
  updated_at: string;
  user_id: string;
}

function rowToTask(row: McpTaskRow): McpTaskRecord {
  return {
    clientId: row.client_id,
    createdAt: row.created_at,
    ...(row.error !== null && row.error !== undefined
      ? { error: row.error }
      : {}),
    expiresAt: row.expires_at,
    id: row.id,
    inputHash: row.input_hash,
    operationId: row.operation_id,
    ...(row.result !== null && row.result !== undefined
      ? { result: row.result }
      : {}),
    ...(row.space_id ? { spaceId: row.space_id } : {}),
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

/** Service-role store for core.mcp_tasks. Tests keep using memory. */
export function createSupabaseMcpTaskStore(
  client: import("@supabase/supabase-js").SupabaseClient
): McpTaskStore {
  const table = () => client.schema("core").from("mcp_tasks");
  return {
    async create(record) {
      const { data, error } = await table()
        .insert({
          client_id: record.clientId,
          created_at: record.createdAt,
          error: record.error ?? null,
          expires_at: record.expiresAt,
          id: record.id,
          input_hash: record.inputHash,
          operation_id: record.operationId,
          result: record.result ?? null,
          space_id: record.spaceId ?? null,
          status: record.status,
          tenant_id: record.tenantId,
          updated_at: record.updatedAt,
          user_id: record.userId,
        })
        .select()
        .single();
      if (error || !data) {
        throw new Error(error?.message ?? "mcp_task_create_failed");
      }
      return rowToTask(data as McpTaskRow);
    },
    async get(id) {
      const { data, error } = await table()
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      const row = rowToTask(data as McpTaskRow);
      if (Date.parse(row.expiresAt) <= Date.now()) {
        return { ...row, status: "failed", error: { code: "expired" } };
      }
      return row;
    },
    async update(id, patch) {
      const { data, error } = await table()
        .update({
          ...(patch.error === undefined ? {} : { error: patch.error }),
          ...(patch.result === undefined ? {} : { result: patch.result }),
          ...(patch.status ? { status: patch.status } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      return rowToTask(data as McpTaskRow);
    },
    async cancel(id) {
      return this.update(id, { status: "cancelled" });
    },
  };
}
