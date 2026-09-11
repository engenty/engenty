import { formatTableCell, type TableColumn } from "@engenty/ai-core/browser";
import {
  cn,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import {
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTableGridCell } from "./data-table-grid-cell.js";
import { DataTableNewRow, DataTableToolbar } from "./data-table-toolbar.js";
import { columnHint, type TableWorkspaceRow } from "./table-workspace-model.js";

const features = tableFeatures({
  columnResizingFeature,
  columnSizingFeature,
  rowSortingFeature,
  sortFns: { alphanumeric: sortFn_alphanumeric },
  sortedRowModel: createSortedRowModel(),
});

const columnHelper = createColumnHelper<typeof features, TableWorkspaceRow>();

export function DataTableGrid({
  columns,
  onOpenCreate,
  onOpenRow,
  onUpdateCell,
  rows,
}: {
  columns: TableColumn[];
  onOpenCreate: () => void;
  onOpenRow: (row: TableWorkspaceRow) => void;
  onUpdateCell: (
    row: TableWorkspaceRow,
    columnId: string,
    value: unknown
  ) => void;
  rows: TableWorkspaceRow[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((row) =>
      columns.some((column) =>
        formatTableCell(column, row.cells[column.id])
          .toLowerCase()
          .includes(query)
      )
    );
  }, [columns, rows, search]);

  const tableColumns = useMemo(
    () =>
      columnHelper.columns(
        columns.map((column, index) =>
          columnHelper.accessor((row) => row.cells[column.id], {
            cell: ({ getValue, row }) => (
              <DataTableGridCell
                column={column}
                isPrimary={index === 0}
                onOpenRow={onOpenRow}
                onUpdateCell={onUpdateCell}
                row={row.original}
                value={getValue()}
              />
            ),
            header: () => {
              const hint = columnHint(column);
              return (
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate">{column.name}</span>
                  {hint ? (
                    <span className="truncate font-normal text-[11px] text-muted-foreground/55">
                      {hint}
                    </span>
                  ) : null}
                </span>
              );
            },
            id: column.id,
            minSize: 96,
            size: 180,
            sortFn: "alphanumeric",
          })
        )
      ),
    [columns, onOpenRow, onUpdateCell]
  );

  const table = useTable({
    columnResizeMode: "onChange",
    columns: tableColumns,
    data: filtered,
    enableColumnResizing: true,
    features,
    getRowId: (row) => row.id,
  });

  return (
    <div className="flex max-h-full min-h-0 flex-col">
      <DataTableToolbar
        onOpenCreate={onOpenCreate}
        onSearchChange={setSearch}
        recordCount={rows.length}
        search={search}
      />
      <div className="min-h-0 overflow-auto">
        <Table
          noWrapper
          style={{ minWidth: table.getTotalSize?.() ?? undefined }}
        >
          <TableHeader className={STICKY_HEADER_CLASS}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                className="hover:bg-transparent [&>th:first-child]:pl-4 [&>th:last-child]:pr-4"
                key={headerGroup.id}
              >
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted?.() as
                    | false
                    | "asc"
                    | "desc"
                    | undefined;
                  return (
                    <TableHead
                      className="group relative px-3"
                      key={header.id}
                      style={{ width: header.getSize() }}
                    >
                      <button
                        className={cn(
                          "flex w-full min-w-0 items-center gap-1 text-left",
                          header.column.getCanSort?.() &&
                            "cursor-pointer select-none"
                        )}
                        onClick={header.column.getToggleSortingHandler?.()}
                        type="button"
                      >
                        <table.FlexRender header={header} />
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3 shrink-0 opacity-70" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3 shrink-0 opacity-70" />
                        ) : (
                          <ArrowUp className="size-3 shrink-0 opacity-0 group-hover:opacity-40" />
                        )}
                      </button>
                      {header.column.getCanResize?.() ? (
                        <div
                          className="absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none bg-border opacity-0 hover:opacity-100"
                          onMouseDown={header.getResizeHandler?.()}
                          onTouchStart={header.getResizeHandler?.()}
                        />
                      ) : null}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  className="px-4 py-8 text-muted-foreground"
                  colSpan={columns.length}
                >
                  {search.trim() ? "No matching records." : "No records yet."}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  className="[&>td:first-child]:pl-4 [&>td:last-child]:pr-4"
                  key={row.id}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell
                      className="whitespace-normal px-3 py-1.5"
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <DataTableNewRow onOpenCreate={onOpenCreate} />
    </div>
  );
}
