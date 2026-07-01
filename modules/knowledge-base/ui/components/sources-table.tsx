import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
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
import { Link, useNavigate } from "react-router-dom";
import type { KbSource } from "../../src/schema/types.js";
import type { KbSourceAdapterDescriptor, KbSourcesListQuery } from "../api.js";
import { kbSourcePath } from "../kb-paths.js";
import { useKbSourceMutations } from "../queries.js";
import { SourcesRowMenuItems } from "./sources-row-menu-items.js";

export type SourcesSortColumn =
  | "name"
  | "created_at"
  | "updated_at"
  | "last_run_at"
  | "next_run_at";

export interface SourcesColumnVisibility {
  adapter: boolean;
  createdAt: boolean;
  lastRun: boolean;
  name: boolean;
  nextRun: boolean;
  status: boolean;
  updatedAt: boolean;
}

const COLUMN_TO_SORT: Partial<
  Record<keyof SourcesColumnVisibility, SourcesSortColumn>
> = {
  name: "name",
  lastRun: "last_run_at",
  nextRun: "next_run_at",
  updatedAt: "updated_at",
  createdAt: "created_at",
};

type TableSize = "compact" | "normal";

function SourceStatusDot({ status }: { status: string }) {
  const dotColor =
    status === "active"
      ? "bg-green-500"
      : status === "failed"
        ? "bg-destructive"
        : status === "paused"
          ? "bg-amber-500"
          : "bg-muted-foreground/60";
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)} />
      <span className="capitalize">{status.replaceAll("_", " ")}</span>
    </span>
  );
}

interface SourcesTableProps {
  adapters: KbSourceAdapterDescriptor[];
  allSelected: boolean;
  columnOrder: (keyof SourcesColumnVisibility)[];
  columnVisibility: SourcesColumnVisibility;
  kbSlug: string;
  listQuery: KbSourcesListQuery;
  onDeleteRequest: (source: KbSource) => void;
  onEdit: (source: KbSource) => void;
  onOpenItems: (source: KbSource) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSortChange: (column: SourcesSortColumn) => void;
  onWebhookRotated: (token: string) => void;
  selectedIds: Set<string>;
  someSelected: boolean;
  sortBy: SourcesSortColumn;
  sortOrder: "asc" | "desc";
  sources: KbSource[];
  tableSize: TableSize;
}

export function SourcesTable({
  sources,
  adapters,
  kbSlug,
  listQuery,
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
  onEdit,
  onOpenItems,
  onWebhookRotated,
  onDeleteRequest,
}: SourcesTableProps) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const mutations = useKbSourceMutations(listQuery);

  const labels: Record<keyof SourcesColumnVisibility, string> = {
    name: t("sources.name"),
    adapter: t("sources.adapter"),
    status: t("sources.status"),
    lastRun: t("sources.last_run"),
    nextRun: t("sources.next_run"),
    updatedAt: t("columns.updated_at"),
    createdAt: t("columns.created_at"),
  };

  const compact = tableSize === "compact";

  function adapterLabel(source: KbSource) {
    return (
      adapters.find((a) => a.id === source.adapter_id)?.label ??
      source.adapter_id.replaceAll("_", " ")
    );
  }

  function cellContent(key: keyof SourcesColumnVisibility, source: KbSource) {
    switch (key) {
      case "name":
        return (
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={(e) => e.stopPropagation()}
            to={kbSourcePath(kbSlug, source.id)}
          >
            {source.name}
          </Link>
        );
      case "adapter":
        return adapterLabel(source);
      case "status":
        return <SourceStatusDot status={source.status} />;
      case "lastRun":
        return source.last_run_at
          ? new Date(source.last_run_at).toLocaleString()
          : t("sources.never");
      case "nextRun":
        return source.next_run_at
          ? new Date(source.next_run_at).toLocaleString()
          : t("sources.manual");
      case "updatedAt":
        return new Date(source.updated_at).toLocaleString();
      case "createdAt":
        return new Date(source.created_at).toLocaleString();
      default:
        return "—";
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
                <TableSortableHeader<SourcesSortColumn>
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
      <TableBody className="[--ui-canvas-row-divider-w:0px]">
        {sources.map((source) => (
          <TableRow
            className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
            data-state={selectedIds.has(source.id) ? "selected" : undefined}
            key={source.id}
            onClick={() => navigate(kbSourcePath(kbSlug, source.id))}
          >
            <TableSelectionCell
              checked={selectedIds.has(source.id)}
              compact={compact}
              hoverReveal
              id={source.id}
              onCheckedChange={onSelectOne}
            />
            {columnOrder.map((key) => {
              if (!columnVisibility[key]) {
                return null;
              }
              return (
                <TableCell key={key}>{cellContent(key, source)}</TableCell>
              );
            })}
            <TableRowActions compact={compact}>
              <SourcesRowMenuItems
                onDelete={onDeleteRequest}
                onEdit={onEdit}
                onOpenItems={onOpenItems}
                onRotate={(s) =>
                  mutations.rotateWebhook.mutate(s.id, {
                    onSuccess: (r) => onWebhookRotated(r.webhook_token),
                  })
                }
                onRun={(s) => mutations.run.mutate(s.id)}
                source={source}
              />
            </TableRowActions>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
