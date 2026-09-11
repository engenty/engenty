import type { TableColumn } from "@engenty/ai-core/browser";
import {
  type PostgresChangeRealtimeClient,
  subscribePostgresChanges,
} from "@engenty/live-cache";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  appsAiRequestHeaders,
  normalizeAppsAiServiceBaseUrl,
  resolveEngentyAiServiceBaseUrl,
} from "../ag-ui/apps-ai/apps-ai-api.js";

export interface DataTableDto {
  columns: TableColumn[];
  id: string;
  space_id: string;
  title: string;
}

export interface DataTableRowDto {
  cells: Record<string, unknown>;
  id: string;
}

export function dataTableQueryKey(tableId: string | null) {
  return ["ai", "data-table", tableId] as const;
}

function tablesPath(): string {
  const base = resolveEngentyAiServiceBaseUrl();
  if (!base) {
    throw new Error("Engenty AI service base URL is not configured");
  }
  return `${normalizeAppsAiServiceBaseUrl(base)}/ai/data-tables`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = await appsAiRequestHeaders();
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error((body as { error?: string }).error ?? `HTTP ${res.status}`),
      { status: res.status, body }
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function fetchDataTable(tableId: string): Promise<{
  rows: DataTableRowDto[];
  table: DataTableDto;
}> {
  return requestJson(`${tablesPath()}/${encodeURIComponent(tableId)}`);
}

export async function insertDataTableRows(
  tableId: string,
  rows: Record<string, unknown>[]
): Promise<{ rows: DataTableRowDto[] }> {
  return requestJson(`${tablesPath()}/${encodeURIComponent(tableId)}/rows`, {
    body: JSON.stringify({ rows }),
    method: "POST",
  });
}

export async function updateDataTableRow(
  tableId: string,
  rowId: string,
  values: Record<string, unknown>
): Promise<{ row: DataTableRowDto }> {
  return requestJson(
    `${tablesPath()}/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`,
    {
      body: JSON.stringify({ values }),
      method: "PATCH",
    }
  );
}

export async function deleteDataTableRows(
  tableId: string,
  rowIds: string[]
): Promise<{ deleted: number }> {
  return requestJson(`${tablesPath()}/${encodeURIComponent(tableId)}/rows`, {
    body: JSON.stringify({ row_ids: rowIds }),
    method: "DELETE",
  });
}

/**
 * Follow one Space table: a row written by an agent (table_write), a person
 * (Data tab) or an App (bridge table_write), and a column change on the table
 * itself. The signal carries no rows — callers refetch. Realtime for
 * ai.data_table / ai.data_table_row is tenant-filtered by RLS on the server.
 */
export function subscribeDataTableChanges(params: {
  client: PostgresChangeRealtimeClient | null;
  onChange: () => void;
  tableId: string;
}): () => void {
  if (!params.client) {
    return () => undefined;
  }
  return subscribePostgresChanges({
    changes: [
      {
        event: "*",
        filter: `table_id=eq.${params.tableId}`,
        schema: "ai",
        table: "data_table_row",
      },
      {
        event: "UPDATE",
        filter: `id=eq.${params.tableId}`,
        schema: "ai",
        table: "data_table",
      },
    ],
    channelName: `engenty-data-table:${params.tableId}`,
    client: params.client,
    onSignal: () => params.onChange(),
  });
}

export function useDataTableQuery(tableId: string | null) {
  return useQuery({
    enabled: Boolean(tableId),
    queryFn: () => fetchDataTable(tableId ?? ""),
    queryKey: dataTableQueryKey(tableId),
  });
}

export function useDataTableMutations(tableId: string | null) {
  const queryClient = useQueryClient();
  const key = dataTableQueryKey(tableId);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const insert = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) =>
      insertDataTableRows(tableId ?? "", rows),
    onSettled: invalidate,
  });

  const update = useMutation({
    mutationFn: (input: { rowId: string; values: Record<string, unknown> }) =>
      updateDataTableRow(tableId ?? "", input.rowId, input.values),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{
        rows: DataTableRowDto[];
        table: DataTableDto;
      }>(key);
      if (previous) {
        queryClient.setQueryData(key, {
          ...previous,
          rows: previous.rows.map((row) =>
            row.id === input.rowId
              ? { ...row, cells: { ...row.cells, ...input.values } }
              : row
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (rowIds: string[]) =>
      deleteDataTableRows(tableId ?? "", rowIds),
    onSettled: invalidate,
  });

  return { insert, remove, update };
}
