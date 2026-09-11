import { useTranslation } from "@engenty/i18n/ui";
import {
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
import { Plug } from "lucide-react";
import { Link } from "react-router-dom";
import type { InboxItem, InboxStatus } from "../../src/schema/types.js";
import { kbInboxDetailPath, kbSourcePath } from "../kb-paths.js";
import { kbAdapterRegistryLabel } from "../lib/kb-adapter-registry-label.js";
import { InboxRowMenuItems } from "./inbox-row-menu-items.js";
import type {
  InboxColumnVisibility,
  InboxSortColumn,
} from "./inbox-table-toolbar.js";

const COLUMN_TO_SORT: Partial<
  Record<keyof InboxColumnVisibility, InboxSortColumn>
> = {
  title: "title",
  status: "status",
  capturedAt: "captured_at",
};

type TableSize = "compact" | "normal";

interface InboxTableProps {
  allSelected: boolean;
  columnOrder: (keyof InboxColumnVisibility)[];
  columnVisibility: InboxColumnVisibility;
  items: InboxItem[];
  onFetchItemUrl: (item: InboxItem) => void;
  onOpenItem: (item: InboxItem) => void;
  onRequestDeleteItem: (item: InboxItem) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSetItemStatus: (item: InboxItem, status: InboxStatus) => void;
  onSortChange: (column: InboxSortColumn) => void;
  selectedIds: Set<string>;
  someSelected: boolean;
  sortBy: InboxSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
}

export function InboxTable({
  items,
  columnVisibility,
  columnOrder,
  sortBy,
  sortOrder,
  tableSize,
  selectedIds,
  allSelected,
  someSelected,
  onSortChange,
  onSelectAll,
  onSelectOne,
  onFetchItemUrl,
  onOpenItem,
  onRequestDeleteItem,
  onSetItemStatus,
}: InboxTableProps) {
  const { t } = useTranslation("kb");
  const compact = tableSize === "compact";

  const labels: Record<keyof InboxColumnVisibility, string> = {
    title: t("inbox.col_title"),
    status: t("inbox.col_status"),
    sourceType: t("inbox.col_source_type"),
    linkedAdapter: t("inbox.col_adapter_type"),
    capturedAt: t("inbox.col_captured"),
  };

  function renderCell(key: keyof InboxColumnVisibility, row: InboxItem) {
    switch (key) {
      case "title":
        return (
          <TableCell className="font-medium" key={key}>
            <Link
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
              to={kbInboxDetailPath(row.id)}
            >
              {row.title}
            </Link>
          </TableCell>
        );
      case "status":
        return <TableCell key={key}>{row.status}</TableCell>;
      case "sourceType":
        return <TableCell key={key}>{row.source_type}</TableCell>;
      case "linkedAdapter": {
        const sid = row.linked_kb_source_id;
        const aid = row.linked_adapter_id;
        if (!(sid && aid)) {
          return (
            <TableCell className="text-muted-foreground" key={key}>
              —
            </TableCell>
          );
        }
        const label = kbAdapterRegistryLabel(aid);
        return (
          <TableCell className="max-w-[16rem]" key={key}>
            <span className="inline-flex items-center gap-2">
              <span className="truncate text-sm">{label}</span>
              <Link
                aria-label={t("inbox.open_linked_source")}
                className="shrink-0 rounded-sm text-primary hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => e.stopPropagation()}
                title={t("inbox.open_linked_source")}
                to={kbSourcePath(sid)}
              >
                <Plug className="h-4 w-4" />
              </Link>
            </span>
          </TableCell>
        );
      }
      case "capturedAt":
        return (
          <TableCell className="text-muted-foreground text-sm" key={key}>
            {new Date(row.captured_at).toLocaleString()}
          </TableCell>
        );
      default:
        return null;
    }
  }

  return (
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
                <TableSortableHeader<InboxSortColumn>
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
          <TableHead
            className={`w-[40px] text-right ${compact ? "!py-1.5" : ""}`}
          >
            <span className="sr-only">{t("sources.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row) => (
          <TableRow
            className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5 text-xs" : "[&>td]:!py-3"}`}
            data-state={selectedIds.has(row.id) ? "selected" : undefined}
            key={row.id}
            onClick={() => onOpenItem(row)}
          >
            <TableSelectionCell
              checked={selectedIds.has(row.id)}
              compact={compact}
              hoverReveal
              id={row.id}
              onCheckedChange={onSelectOne}
            />
            {columnOrder.map((key) => {
              if (!columnVisibility[key]) {
                return null;
              }
              return renderCell(key, row);
            })}
            <TableRowActions compact={compact}>
              <InboxRowMenuItems
                item={row}
                onFetchFromUrl={() => onFetchItemUrl(row)}
                onOpenDetail={() => onOpenItem(row)}
                onRequestDelete={() => onRequestDeleteItem(row)}
                onSetStatus={(status) => onSetItemStatus(row, status)}
              />
            </TableRowActions>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
