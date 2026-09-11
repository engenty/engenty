import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableSelectionCell,
  TableSelectionHeader,
  type TableSize,
  TableSortableHeader,
} from "@engenty/ui-core";
import { Link } from "react-router-dom";
import { driveNodeIcon } from "./drive-kind-icon";
import {
  type FolderChildRow,
  type FolderListColumn,
  type FolderListSortColumn,
  formatFolderRowDate,
  isFolderRowSelectable,
} from "./folder-list-model";

export interface FolderListSelection {
  allSelected: boolean;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  selectedIds: Set<string>;
  someSelected: boolean;
}

export function FolderListTable({
  columnOrder,
  columnVisibility,
  onSortChange,
  rows,
  selection,
  sortBy,
  sortOrder,
  tableSize,
}: {
  columnOrder: FolderListColumn[];
  columnVisibility: Record<FolderListColumn, boolean>;
  onSortChange: (column: FolderListSortColumn) => void;
  rows: FolderChildRow[];
  selection?: FolderListSelection;
  sortBy: FolderListSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
}) {
  const { t } = useTranslation("common");
  const compact = tableSize === "compact";
  const labels: Record<FolderListColumn, string> = {
    kind: t("spaces.data.colKind", { defaultValue: "Type" }),
    name: t("spaces.data.colName", { defaultValue: "Name" }),
    updatedAt: t("spaces.data.colEdited", { defaultValue: "Edited" }),
  };

  return (
    <Table className="select-none" noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={cn(
            "group border-b-0 hover:bg-transparent",
            compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"
          )}
        >
          {selection ? (
            <TableSelectionHeader
              aria-label={t("spaces.data.list.selectAll", {
                defaultValue: "Select all",
              })}
              checked={
                selection.someSelected && !selection.allSelected
                  ? "indeterminate"
                  : selection.allSelected
              }
              compact={compact}
              onCheckedChange={selection.onSelectAll}
            />
          ) : null}
          {columnOrder.map((key) => {
            if (!columnVisibility[key]) {
              return null;
            }
            return (
              <TableSortableHeader<FolderListSortColumn>
                column={key}
                compact={compact}
                key={key}
                onSort={onSortChange}
                sortBy={sortBy}
                sortOrder={sortOrder}
              >
                {labels[key]}
              </TableSortableHeader>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const selected = selection?.selectedIds.has(row.id) ?? false;
          return (
            <TableRow
              className={cn(
                "group",
                compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"
              )}
              data-state={selected ? "selected" : undefined}
              key={row.id}
            >
              {selection ? (
                isFolderRowSelectable(row) ? (
                  <TableSelectionCell
                    aria-label={t("spaces.data.list.selectRow", {
                      defaultValue: "Select {{name}}",
                      name: row.name,
                    })}
                    checked={selected}
                    compact={compact}
                    id={row.id}
                    onCheckedChange={selection.onSelectOne}
                  />
                ) : (
                  <TableCell className="w-[36px] min-w-[30px] px-0" />
                )
              ) : null}
              {columnOrder.map((key) => {
                if (!columnVisibility[key]) {
                  return null;
                }
                if (key === "name") {
                  return (
                    <TableCell className="max-w-0" key={key}>
                      <NameCell row={row} />
                    </TableCell>
                  );
                }
                if (key === "kind") {
                  return (
                    <TableCell
                      className="text-muted-foreground text-sm"
                      key={key}
                    >
                      {t(`spaces.data.kind.${row.kind}`, {
                        defaultValue: row.kind,
                      })}
                    </TableCell>
                  );
                }
                return (
                  <TableCell
                    className="text-muted-foreground text-sm tabular-nums"
                    key={key}
                  >
                    {formatFolderRowDate(row.updatedAt) || "—"}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function NameCell({ row }: { row: FolderChildRow }) {
  const Icon = driveNodeIcon({
    kind: row.kind,
    ...(row.nodeType ? { nodeType: row.nodeType } : {}),
  });
  return (
    <Link className="flex min-w-0 items-center gap-2.5 text-sm" to={row.href}>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{row.name}</span>
    </Link>
  );
}
