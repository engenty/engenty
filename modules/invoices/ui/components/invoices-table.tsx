import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenuItem,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableSelectionCell,
  TableSelectionHeader,
  TableSortableHeader,
} from "@engenty/ui-core";
import { AnimatedDownloadIcon } from "@engenty/ui-icons";
import { FileEdit } from "lucide-react";
import { useMemo } from "react";
import type { InvoiceListItem } from "../api.js";
import type {
  InvoicesColumnVisibility,
  InvoicesSortColumn,
} from "./invoices-display-dialog.js";

const COLUMN_TO_SORT: Partial<
  Record<keyof InvoicesColumnVisibility, InvoicesSortColumn>
> = {
  number: "number",
  date: "date",
  dueDate: "dueDate",
  sumBrutto: "sumBrutto",
};

type TableSize = "compact" | "normal";

interface InvoicesTableProps {
  columnOrder: (keyof InvoicesColumnVisibility)[];
  columnVisibility: InvoicesColumnVisibility;
  formatCurrency: (n: number) => string;
  invoices: InvoiceListItem[];
  onDownloadPdf: (invoice: InvoiceListItem) => void;
  onEdit: (invoice: InvoiceListItem) => void;
  onRowClick: (invoice: InvoiceListItem) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSortChange: (column: InvoicesSortColumn) => void;
  selectedIds: Set<string>;
  sortBy: InvoicesSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
}

export function InvoicesTable({
  invoices,
  columnVisibility,
  columnOrder,
  sortBy,
  sortOrder,
  tableSize,
  selectedIds,
  onSortChange,
  onSelectAll,
  onSelectOne,
  onRowClick,
  onDownloadPdf,
  onEdit,
  formatCurrency,
}: InvoicesTableProps) {
  const { t } = useTranslation("invoices");

  const allSelected =
    invoices.length > 0 && selectedIds.size === invoices.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < invoices.length;

  const labels: Record<keyof InvoicesColumnVisibility, string> = useMemo(
    () => ({
      number: t("number"),
      date: t("date"),
      dueDate: t("dueDate"),
      recipient: t("recipient"),
      sumBrutto: t("brutto"),
      content: t("content"),
    }),
    [t]
  );

  const compact = tableSize === "compact";

  return (
    <Table noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={`group border-b-0 hover:bg-transparent ${compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"}`}
        >
          <TableSelectionHeader
            aria-label={t("selectAll", { defaultValue: "Select all" })}
            checked={
              someSelected && !allSelected ? "indeterminate" : allSelected
            }
            compact={compact}
            onCheckedChange={onSelectAll}
          />
          {columnOrder.map((key) => {
            if (!columnVisibility[key]) {
              return null;
            }
            const sortColumn = COLUMN_TO_SORT[key];
            if (sortColumn) {
              return (
                <TableSortableHeader<InvoicesSortColumn>
                  column={sortColumn}
                  compact={compact}
                  key={key}
                  onSort={onSortChange}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                >
                  {labels[key]}
                </TableSortableHeader>
              );
            }
            return (
              <TableHead className={compact ? "!py-1.5 h-8" : ""} key={key}>
                {labels[key]}
              </TableHead>
            );
          })}
          <TableHead
            className={`w-[40px] px-1 ${compact ? "!py-1.5 h-8" : ""}`}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => (
          <TableRow
            className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
            data-state={selectedIds.has(inv.id) ? "selected" : undefined}
            key={inv.id}
            onClick={() => onRowClick(inv)}
          >
            <TableSelectionCell
              checked={selectedIds.has(inv.id)}
              compact={compact}
              hoverReveal
              id={inv.id}
              onCheckedChange={onSelectOne}
            />
            {columnOrder.map((key) => {
              if (!columnVisibility[key]) {
                return null;
              }
              const val =
                key === "number"
                  ? inv.number
                  : key === "date"
                    ? inv.date
                    : key === "dueDate"
                      ? inv.dueDate
                      : key === "recipient"
                        ? (inv.recipientSnapshot?.displayName ?? "-")
                        : key === "sumBrutto"
                          ? formatCurrency(inv.sumBrutto)
                          : inv.content;
              return (
                <TableCell
                  className={key === "number" ? "font-medium" : ""}
                  key={key}
                >
                  {val}
                </TableCell>
              );
            })}
            <TableRowActions compact={compact}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDownloadPdf(inv);
                }}
              >
                <AnimatedDownloadIcon className="mr-2" size="sm" />
                {t("downloadPdf")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(inv);
                }}
              >
                <FileEdit className="mr-2 h-4 w-4" />
                {t("edit", { context: "invoice" })}
              </DropdownMenuItem>
            </TableRowActions>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
