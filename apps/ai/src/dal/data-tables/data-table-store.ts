import { parseTableColumns, type TableColumn } from "@engenty/ai-core";
import { emitAppEvent } from "../../infra/app-events.js";
import {
  createDbSourceFromEnv,
  type DbSource,
  normalizeDbSource,
} from "../../infra/tenant-db.js";

const AI_SCHEMA = "ai";

/**
 * What a row write raises on the in-process bus, so an event routine can
 * listen to a table the way it listens to a module record. Every payload
 * carries `table_id` and `space_id` at the top level — the two keys an
 * `event_filter` pins. One event per write call: a batch insert is one
 * event with every row, not one wake per row.
 */
export const DATA_TABLE_ROW_EVENTS = {
  created: "ai.data_table.row.created",
  deleted: "ai.data_table.row.deleted",
  updated: "ai.data_table.row.updated",
} as const;

export interface DataTableRecord {
  columns: TableColumn[];
  created_at: string;
  created_by: string | null;
  id: string;
  space_id: string;
  title: string;
  updated_at: string;
}

export interface DataTableRowRecord {
  cells: Record<string, unknown>;
  created_at: string;
  id: string;
  table_id: string;
  updated_at: string;
}

function asTable(row: Record<string, unknown>): DataTableRecord {
  return {
    columns: parseTableColumns(row.columns),
    created_at: String(row.created_at),
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    id: String(row.id),
    space_id: String(row.space_id),
    title: String(row.title),
    updated_at: String(row.updated_at),
  };
}

function asRow(row: Record<string, unknown>): DataTableRowRecord {
  const cells =
    row.cells !== null &&
    typeof row.cells === "object" &&
    !Array.isArray(row.cells)
      ? (row.cells as Record<string, unknown>)
      : {};
  return {
    cells,
    created_at: String(row.created_at),
    id: String(row.id),
    table_id: String(row.table_id),
    updated_at: String(row.updated_at),
  };
}

export function createDataTableStore(source: DbSource) {
  const { forTenant } = normalizeDbSource(source);
  const dbFor = (tenantId: string) => forTenant(tenantId).schema(AI_SCHEMA);

  async function getTable(params: {
    tableId: string;
    tenantId: string;
  }): Promise<DataTableRecord | null> {
    const { data, error } = await dbFor(params.tenantId)
      .from("data_table")
      .select()
      .eq("tenant_id", params.tenantId)
      .eq("id", params.tableId)
      .maybeSingle();
    if (error) {
      throw new Error(`data_table select: ${error.message}`);
    }
    return data ? asTable(data as Record<string, unknown>) : null;
  }

  // A table's Space never changes, so one lookup per table per process is
  // enough to stamp every row event with it.
  const spaceByTable = new Map<string, string>();
  async function spaceOf(tenantId: string, tableId: string): Promise<string> {
    const cached = spaceByTable.get(tableId);
    if (cached) {
      return cached;
    }
    const table = await getTable({ tableId, tenantId });
    const spaceId = table?.space_id ?? "";
    if (spaceId) {
      spaceByTable.set(tableId, spaceId);
    }
    return spaceId;
  }

  // The row is already written when this runs; nothing here may fail the
  // write that raised it.
  async function emitRowEvent(
    resource: (typeof DATA_TABLE_ROW_EVENTS)[keyof typeof DATA_TABLE_ROW_EVENTS],
    input: { tableId: string; tenantId: string },
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      emitAppEvent({
        payload: {
          space_id: await spaceOf(input.tenantId, input.tableId),
          table_id: input.tableId,
          ...payload,
        },
        resource,
        tenantId: input.tenantId,
      });
    } catch (error) {
      console.warn(`[data-tables] ${resource} not raised`, {
        message: error instanceof Error ? error.message : String(error),
        tableId: input.tableId,
      });
    }
  }

  return {
    getTable,

    async getRow(input: {
      rowId: string;
      tableId: string;
      tenantId: string;
    }): Promise<DataTableRowRecord | null> {
      const { data, error } = await dbFor(input.tenantId)
        .from("data_table_row")
        .select()
        .eq("tenant_id", input.tenantId)
        .eq("table_id", input.tableId)
        .eq("id", input.rowId)
        .maybeSingle();
      if (error) {
        throw new Error(`data_table_row select: ${error.message}`);
      }
      return data ? asRow(data as Record<string, unknown>) : null;
    },

    async createTable(input: {
      columns: TableColumn[];
      createdBy?: string | null;
      spaceId: string;
      tenantId: string;
      title: string;
    }): Promise<DataTableRecord> {
      const columns = parseTableColumns(input.columns);
      const { data, error } = await dbFor(input.tenantId)
        .from("data_table")
        .insert({
          columns,
          created_by: input.createdBy ?? null,
          space_id: input.spaceId,
          tenant_id: input.tenantId,
          title: input.title,
        })
        .select()
        .single();
      if (error || !data) {
        throw new Error(`data_table insert: ${error?.message ?? "empty"}`);
      }
      return asTable(data as Record<string, unknown>);
    },

    async updateTable(input: {
      columns?: TableColumn[];
      tableId: string;
      tenantId: string;
      title?: string;
    }): Promise<DataTableRecord> {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.columns) {
        patch.columns = parseTableColumns(input.columns);
      }
      if (input.title !== undefined) {
        patch.title = input.title;
      }
      const { data, error } = await dbFor(input.tenantId)
        .from("data_table")
        .update(patch)
        .eq("tenant_id", input.tenantId)
        .eq("id", input.tableId)
        .select()
        .single();
      if (error || !data) {
        throw new Error(`data_table update: ${error?.message ?? "empty"}`);
      }
      return asTable(data as Record<string, unknown>);
    },

    async listRows(input: {
      limit?: number;
      offset?: number;
      tableId: string;
      tenantId: string;
    }): Promise<DataTableRowRecord[]> {
      const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
      const offset = Math.max(input.offset ?? 0, 0);
      const { data, error } = await dbFor(input.tenantId)
        .from("data_table_row")
        .select()
        .eq("tenant_id", input.tenantId)
        .eq("table_id", input.tableId)
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) {
        throw new Error(`data_table_row list: ${error.message}`);
      }
      return (data ?? []).map((row) => asRow(row as Record<string, unknown>));
    },

    async insertRows(input: {
      rows: Record<string, unknown>[];
      tableId: string;
      tenantId: string;
    }): Promise<DataTableRowRecord[]> {
      if (input.rows.length === 0) {
        return [];
      }
      const { data, error } = await dbFor(input.tenantId)
        .from("data_table_row")
        .insert(
          input.rows.map((cells) => ({
            cells,
            table_id: input.tableId,
            tenant_id: input.tenantId,
          }))
        )
        .select();
      if (error) {
        throw new Error(`data_table_row insert: ${error.message}`);
      }
      const rows = (data ?? []).map((row) =>
        asRow(row as Record<string, unknown>)
      );
      await emitRowEvent(DATA_TABLE_ROW_EVENTS.created, input, {
        row_ids: rows.map((row) => row.id),
        rows: rows.map((row) => ({ cells: row.cells, id: row.id })),
      });
      return rows;
    },

    async updateRow(input: {
      cells: Record<string, unknown>;
      rowId: string;
      tableId: string;
      tenantId: string;
    }): Promise<DataTableRowRecord> {
      const { data, error } = await dbFor(input.tenantId)
        .from("data_table_row")
        .update({
          cells: input.cells,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", input.tenantId)
        .eq("table_id", input.tableId)
        .eq("id", input.rowId)
        .select()
        .single();
      if (error || !data) {
        throw new Error(`data_table_row update: ${error?.message ?? "empty"}`);
      }
      const row = asRow(data as Record<string, unknown>);
      await emitRowEvent(DATA_TABLE_ROW_EVENTS.updated, input, {
        cells: row.cells,
        row_id: row.id,
      });
      return row;
    },

    async deleteRows(input: {
      rowIds: string[];
      tableId: string;
      tenantId: string;
    }): Promise<number> {
      if (input.rowIds.length === 0) {
        return 0;
      }
      const { data, error } = await dbFor(input.tenantId)
        .from("data_table_row")
        .delete()
        .eq("tenant_id", input.tenantId)
        .eq("table_id", input.tableId)
        .in("id", input.rowIds)
        .select("id");
      if (error) {
        throw new Error(`data_table_row delete: ${error.message}`);
      }
      const deleted = (data ?? []).map((row) =>
        String((row as { id: unknown }).id)
      );
      if (deleted.length > 0) {
        await emitRowEvent(DATA_TABLE_ROW_EVENTS.deleted, input, {
          row_ids: deleted,
        });
      }
      return deleted.length;
    },
  };
}

export type DataTableStore = ReturnType<typeof createDataTableStore>;

let envStore: DataTableStore | null | undefined;

export function createDataTableStoreFromEnv(): DataTableStore | null {
  if (envStore === undefined) {
    const source = createDbSourceFromEnv();
    envStore = source ? createDataTableStore(source) : null;
  }
  return envStore;
}
