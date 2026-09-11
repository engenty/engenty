import { columnEdit, type TableColumn } from "@engenty/ai-core/browser";
import { cn, Switch } from "@engenty/ui-core";
import { PanelRight, Pencil } from "lucide-react";
import { useState } from "react";
import { DataTableCellDisplay } from "./data-table-cell-display.js";
import { DataTableCellEditor } from "./data-table-cell-editor.js";
import { DataTableInlineEditor } from "./data-table-cell-inline.js";
import type { TableWorkspaceRow } from "./table-workspace-model.js";

const ICON_BTN =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

export function DataTableGridCell({
  column,
  isPrimary,
  onOpenRow,
  onUpdateCell,
  row,
  value,
}: {
  column: TableColumn;
  isPrimary: boolean;
  onOpenRow: (row: TableWorkspaceRow) => void;
  onUpdateCell: (
    row: TableWorkspaceRow,
    columnId: string,
    value: unknown
  ) => void;
  row: TableWorkspaceRow;
  value: unknown;
}) {
  const edit = columnEdit(column);
  const [inline, setInline] = useState(false);
  const [popout, setPopout] = useState(false);
  const editingInline = inline && edit === "inline";

  if (column.type === "boolean" && edit === "inline") {
    return (
      <div className="flex min-h-8 items-center">
        <Switch
          aria-label={column.name}
          checked={value === true}
          onCheckedChange={(checked) =>
            onUpdateCell(row, column.id, checked === true)
          }
        />
      </div>
    );
  }

  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);

  const body = editingInline ? (
    <DataTableInlineEditor
      column={column}
      onCancel={() => setInline(false)}
      onCommit={(next) => {
        onUpdateCell(row, column.id, next);
        setInline(false);
      }}
      value={value}
    />
  ) : (
    <div
      aria-label={empty ? column.name : undefined}
      className="flex min-h-8 w-full min-w-0 cursor-text items-center text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) {
          return;
        }
        if (edit === "inline") {
          setInline(true);
          return;
        }
        setPopout(true);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        if (edit === "inline") {
          setInline(true);
          return;
        }
        setPopout(true);
      }}
      role="button"
      tabIndex={0}
    >
      <DataTableCellDisplay column={column} value={value} />
    </div>
  );

  return (
    <DataTableCellEditor
      column={column}
      onCommit={(next) => onUpdateCell(row, column.id, next)}
      onOpenChange={(open) => {
        setPopout(open);
        if (open) {
          setInline(false);
        }
      }}
      onOpenRecord={() => onOpenRow(row)}
      open={popout}
      trigger={
        <div className="group/cell relative flex min-h-8 min-w-0 items-center">
          <div className={cn("min-w-0 flex-1", isPrimary ? "pr-14" : "pr-7")}>
            {body}
          </div>
          {editingInline ? null : (
            <div className="absolute top-1/2 right-0 flex -translate-y-1/2 items-center">
              <button
                aria-label={`Edit ${column.name}`}
                className={cn(
                  ICON_BTN,
                  popout
                    ? "opacity-100"
                    : "opacity-0 focus-visible:opacity-100 group-hover/cell:opacity-100"
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  setInline(false);
                  setPopout(true);
                }}
                type="button"
              >
                <Pencil className="size-3.5" />
              </button>
              {isPrimary ? (
                <button
                  aria-label="Open record"
                  className={cn(
                    ICON_BTN,
                    "opacity-0 focus-visible:opacity-100 group-hover/cell:opacity-100"
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenRow(row);
                  }}
                  type="button"
                >
                  <PanelRight className="size-3.5" />
                </button>
              ) : null}
            </div>
          )}
        </div>
      }
      value={value}
    />
  );
}
