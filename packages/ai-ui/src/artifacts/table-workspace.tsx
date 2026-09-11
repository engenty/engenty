import type { TableColumn } from "@engenty/ai-core/browser";
import { cn, uiCardElevatedClassName } from "@engenty/ui-core";
import { useState } from "react";
import { DataTableGrid } from "./data-table-grid.js";
import { TableRowSheet } from "./data-table-row-sheet.js";
import type {
  TableSheetDraft,
  TableWorkspaceRow,
} from "./table-workspace-model.js";

export function TableWorkspace({
  columns,
  error,
  onDelete,
  onInsert,
  onUpdate,
  pending,
  rows,
}: {
  columns: TableColumn[];
  error: string | null;
  onDelete: (rowId: string) => Promise<void>;
  onInsert: (values: Record<string, unknown>) => Promise<void>;
  onUpdate: (rowId: string, values: Record<string, unknown>) => Promise<void>;
  pending: boolean;
  rows: TableWorkspaceRow[];
}) {
  const [draft, setDraft] = useState<TableSheetDraft | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(error);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-5">
      {error ? <p className="mb-3 text-destructive text-sm">{error}</p> : null}
      <div
        className={cn(
          uiCardElevatedClassName,
          "flex h-fit max-h-full min-h-0 w-full flex-col overflow-hidden"
        )}
      >
        <DataTableGrid
          columns={columns}
          onOpenCreate={() => {
            setSheetError(null);
            setDraft({ kind: "create" });
          }}
          onOpenRow={(row) => {
            setSheetError(null);
            setDraft({ kind: "edit", row });
          }}
          onUpdateCell={(row, columnId, value) => {
            void onUpdate(row.id, { [columnId]: value });
          }}
          rows={rows}
        />
      </div>
      <TableRowSheet
        columns={columns}
        draft={draft}
        error={sheetError}
        onClose={() => setDraft(null)}
        onDelete={(row) => {
          void onDelete(row.id).then(() => setDraft(null));
        }}
        onSubmit={(values) => {
          const run =
            draft?.kind === "edit"
              ? onUpdate(draft.row.id, values)
              : onInsert(values);
          void run
            .then(() => {
              setSheetError(null);
              setDraft(null);
            })
            .catch((caught: unknown) => {
              setSheetError(
                caught instanceof Error
                  ? caught.message
                  : "Could not save this row."
              );
            });
        }}
        pending={pending}
      />
    </div>
  );
}
