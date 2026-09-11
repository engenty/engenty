import { coerceRowValues, type TableColumn } from "@engenty/ai-core/browser";
import { Button, Label } from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { CellField } from "./data-table-cell-editor.js";
import {
  emptyFormValues,
  formValuesFromRow,
  type TableWorkspaceRow,
} from "./table-workspace-model.js";

export function TableRowForm({
  columns,
  error,
  onCancel,
  onDelete,
  onSubmit,
  pending,
  row,
}: {
  columns: TableColumn[];
  error: string | null;
  onCancel: () => void;
  onDelete?: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
  pending: boolean;
  row: TableWorkspaceRow | null;
}) {
  const [values, setValues] = useState(() =>
    row ? formValuesFromRow(columns, row.cells) : emptyFormValues(columns)
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setValues(
      row ? formValuesFromRow(columns, row.cells) : emptyFormValues(columns)
    );
    setLocalError(null);
  }, [columns, row]);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onSubmit(coerceRowValues(columns, values));
          setLocalError(null);
        } catch (caught) {
          setLocalError(
            caught instanceof Error
              ? caught.message
              : "Could not save this row."
          );
        }
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        {columns.map((column) => (
          <div className="grid gap-1.5" key={column.id}>
            <Label htmlFor={`table-field-${column.id}`}>
              {column.name}
              {column.required ? (
                <span className="text-destructive"> *</span>
              ) : null}
            </Label>
            <div id={`table-field-${column.id}`}>
              <CellField
                column={column}
                onChange={(value) =>
                  setValues((current) => ({ ...current, [column.id]: value }))
                }
                value={values[column.id]}
              />
            </div>
          </div>
        ))}
      </div>
      {(localError || error) && (
        <p className="px-6 text-destructive text-sm">{localError ?? error}</p>
      )}
      <div className="flex items-center justify-between gap-2 border-t px-6 py-3">
        {onDelete ? (
          <Button
            disabled={pending}
            onClick={onDelete}
            type="button"
            variant="ghost"
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={pending} type="submit">
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
