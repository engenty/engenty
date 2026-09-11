import { dataTableHandleSchema } from "@engenty/ai-core/browser";
import { useQueryClient } from "@engenty/query-client";
import { useEffect } from "react";
import { useEngentyAIContext } from "../agent-provider/engenty-ai-provider.js";
import type { ArtifactViewProps } from "./artifact-renderers.js";
import {
  dataTableQueryKey,
  subscribeDataTableChanges,
  useDataTableMutations,
  useDataTableQuery,
} from "./data-tables-api.js";
import { TableWorkspace } from "./table-workspace.js";

function tableIdFromHandle(content: string | null): string | null {
  if (!content) {
    return null;
  }
  try {
    const parsed = dataTableHandleSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data.table_id : null;
  } catch {
    return null;
  }
}

export function DatabaseArtifactView({ content }: ArtifactViewProps) {
  const tableId = tableIdFromHandle(content);
  const query = useDataTableQuery(tableId);
  const mutations = useDataTableMutations(tableId);
  const queryClient = useQueryClient();
  const { threadsRealtimeClient } = useEngentyAIContext();

  // The view follows the table: an agent's write lands here without a reload.
  useEffect(() => {
    if (!tableId) {
      return;
    }
    return subscribeDataTableChanges({
      client: threadsRealtimeClient ?? null,
      onChange: () => {
        void queryClient.invalidateQueries({
          queryKey: dataTableQueryKey(tableId),
        });
      },
      tableId,
    });
  }, [tableId, threadsRealtimeClient, queryClient]);

  if (!tableId) {
    return (
      <p className="p-6 text-muted-foreground text-sm">
        This table handle is missing a table_id.
      </p>
    );
  }
  if (query.isPending) {
    return <p className="p-6 text-muted-foreground text-sm">Loading table…</p>;
  }
  if (query.error || !query.data) {
    return (
      <p className="p-6 text-destructive text-sm">
        {query.error instanceof Error
          ? query.error.message
          : "This table could not be read."}
      </p>
    );
  }
  const { table, rows } = query.data;
  const mutationError =
    mutations.insert.error ?? mutations.update.error ?? mutations.remove.error;

  return (
    <TableWorkspace
      columns={table.columns}
      error={
        mutationError instanceof Error
          ? mutationError.message
          : mutationError
            ? "Could not save this table."
            : null
      }
      onDelete={async (rowId) => {
        await mutations.remove.mutateAsync([rowId]);
      }}
      onInsert={async (values) => {
        await mutations.insert.mutateAsync([values]);
      }}
      onUpdate={async (rowId, values) => {
        await mutations.update.mutateAsync({ rowId, values });
      }}
      pending={
        mutations.insert.isPending ||
        mutations.update.isPending ||
        mutations.remove.isPending
      }
      rows={rows}
    />
  );
}
