import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { Faq } from "../../src/schema/types.js";
import { deleteFaq } from "../api.js";
import type {
  FaqsColumnVisibility,
  FaqsSortColumn,
} from "./faqs-table-toolbar.js";

function statusPillClass(status: string) {
  switch (status) {
    case "published":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "draft":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "archived":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

const COLUMN_TO_SORT: Partial<
  Record<keyof FaqsColumnVisibility, FaqsSortColumn>
> = {
  question: "question",
  status: "status",
  sortOrder: "sort_order",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

type TableSize = "compact" | "normal";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

interface FaqsTableProps {
  columnOrder: (keyof FaqsColumnVisibility)[];
  columnVisibility: FaqsColumnVisibility;
  faqs: Faq[];
  onDataChange: () => void;
  onRowClick: (faq: Faq) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSortChange: (column: FaqsSortColumn) => void;
  selectedIds: Set<string>;
  sortBy: FaqsSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
}

export function FaqsTable({
  faqs,
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
  onDataChange,
}: FaqsTableProps) {
  const { t } = useTranslation("kb");

  const allSelected = faqs.length > 0 && selectedIds.size === faqs.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < faqs.length;

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteOne = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteFaq(id);
      onDataChange();
    } finally {
      setDeletingId(null);
    }
  };

  const labels: Record<keyof FaqsColumnVisibility, string> = {
    question: t("faq.fields.question"),
    status: t("columns.status"),
    sortOrder: t("columns.sort_order"),
    tags: t("columns.tags"),
    createdAt: t("columns.created_at"),
    updatedAt: t("columns.updated_at"),
  };

  const compact = tableSize === "compact";

  function cellContent(key: keyof FaqsColumnVisibility, faq: Faq) {
    switch (key) {
      case "question":
        return faq.question;
      case "status":
        return faq.status;
      case "sortOrder":
        return String(faq.sort_order);
      case "tags":
        return (faq.tags ?? []).map((x) => x.name).join(", ") || "—";
      case "createdAt":
        return formatDate(faq.created_at);
      case "updatedAt":
        return formatDate(faq.updated_at);
      default:
        return "—";
    }
  }

  return (
    <>
      <Table noWrapper>
        <TableHeader className={STICKY_HEADER_CLASS}>
          <TableRow
            className={`group border-b-0 hover:bg-transparent ${compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"}`}
          >
            <TableSelectionHeader
              aria-label={t("list.select_all")}
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
                  <TableSortableHeader<FaqsSortColumn>
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
                <TableHead className={compact ? "!py-1.5" : ""} key={key}>
                  {labels[key]}
                </TableHead>
              );
            })}
            <TableCell
              className={`w-[40px] px-1 ${compact ? "!py-1.5" : ""}`}
            />
          </TableRow>
        </TableHeader>
        <TableBody className="[--ui-canvas-row-divider-w:0px]">
          {faqs.map((faq) => (
            <TableRow
              className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
              data-state={selectedIds.has(faq.id) ? "selected" : undefined}
              key={faq.id}
              onClick={() => onRowClick(faq)}
            >
              <TableSelectionCell
                checked={selectedIds.has(faq.id)}
                compact={compact}
                hoverReveal
                id={faq.id}
                onCheckedChange={onSelectOne}
              />
              {columnOrder.map((key) => {
                if (!columnVisibility[key]) {
                  return null;
                }
                const value = cellContent(key, faq);
                return (
                  <TableCell
                    className={key === "question" ? "font-medium" : ""}
                    key={key}
                  >
                    {key === "status" ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs leading-none ${statusPillClass(String(value))}`}
                      >
                        {String(value)}
                      </span>
                    ) : (
                      value
                    )}
                  </TableCell>
                );
              })}
              <TableRowActions compact={compact}>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingId(faq.id);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("article.actions.delete")}
                </DropdownMenuItem>
              </TableRowActions>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        onOpenChange={(open) => !open && setDeletingId(null)}
        open={deletingId !== null}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("list.delete_faq_confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("actions.confirm_delete_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deletingId}
              onClick={() => {
                if (deletingId) {
                  handleDeleteOne(deletingId);
                }
              }}
            >
              {t("article.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
