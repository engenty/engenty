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
  Badge,
  DropdownMenuItem,
  DropdownMenuSeparator,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableRowActions,
  TableSelectionCell,
  TableSelectionHeader,
  TableSortableHeader,
} from "@engenty/ui-core";
import { FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  deleteOffer,
  type OfferListItem,
  type OfferStatus,
  updateOffer,
} from "../api.js";
import type {
  OffersColumnVisibility,
  OffersSortColumn,
} from "./offers-display-dialog.js";

const COLUMN_TO_SORT: Record<keyof OffersColumnVisibility, OffersSortColumn> = {
  title: "title",
  offerNumber: "offer_number",
  status: "status",
  offerDate: "offer_date",
  validUntil: "valid_until",
};

function getCellValue(
  key: keyof OffersColumnVisibility,
  offer: OfferListItem
): string {
  switch (key) {
    case "title":
      return offer.title;
    case "offerNumber":
      return offer.offer_number;
    case "status":
      return offer.status;
    case "offerDate":
      return offer.offer_date ?? "-";
    case "validUntil":
      return offer.valid_until ?? "-";
    default:
      return "-";
  }
}

type TableSize = "compact" | "normal";

interface OffersTableProps {
  columnOrder: (keyof OffersColumnVisibility)[];
  columnVisibility: OffersColumnVisibility;
  getOfferRoute: (offer: OfferListItem) => string;
  offers: OfferListItem[];
  onDataChange: () => void;
  onRowClick: (offer: OfferListItem) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSortChange: (column: OffersSortColumn) => void;
  selectedIds: Set<string>;
  sortBy: OffersSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
}

export function OffersTable({
  offers,
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
  getOfferRoute: _getOfferRoute,
}: OffersTableProps) {
  const { t } = useTranslation("offers");

  const allSelected = offers.length > 0 && selectedIds.size === offers.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < offers.length;

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteOne = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteOffer(id);
      onDataChange();
    } finally {
      setDeletingId(null);
    }
  };

  const handleMarkAsReady = async (offer: OfferListItem) => {
    if (offer.status !== "draft") {
      return;
    }
    try {
      await updateOffer(offer.id, { status: "ready" as OfferStatus });
      onDataChange();
    } catch {
      // Error handling can be added
    }
  };

  const labels: Record<keyof OffersColumnVisibility, string> = {
    title: t("title"),
    offerNumber: t("offerNumber"),
    status: t("status"),
    offerDate: t("offerDate"),
    validUntil: t("validUntil"),
  };

  const compact = tableSize === "compact";

  return (
    <>
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
              return (
                <TableSortableHeader<OffersSortColumn>
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
            })}
            <TableCell
              className={`w-[40px] px-1 ${compact ? "!py-1.5" : ""}`}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {offers.map((offer) => (
            <TableRow
              className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
              data-state={selectedIds.has(offer.id) ? "selected" : undefined}
              key={offer.id}
              onClick={() => onRowClick(offer)}
            >
              <TableSelectionCell
                checked={selectedIds.has(offer.id)}
                compact={compact}
                hoverReveal
                id={offer.id}
                onCheckedChange={onSelectOne}
              />
              {columnOrder.map((key) => {
                if (!columnVisibility[key]) {
                  return null;
                }
                const value = getCellValue(key, offer);
                return (
                  <TableCell
                    className={key === "title" ? "font-medium" : ""}
                    key={key}
                  >
                    {key === "status" ? (
                      <Badge variant="outline">{value}</Badge>
                    ) : (
                      value
                    )}
                  </TableCell>
                );
              })}
              <TableRowActions compact={compact}>
                {offer.status === "draft" && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAsReady(offer);
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    {t("markAsReady")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingId(offer.id);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("delete")}
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
            <AlertDialogTitle>
              {t("deleteOfferConfirm", { defaultValue: "Delete this offer?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteOfferConfirmDescription", {
                defaultValue: "This action cannot be undone.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deletingId}
              onClick={() => {
                if (deletingId) {
                  handleDeleteOne(deletingId);
                }
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
