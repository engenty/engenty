// Grouped table view for the artifacts catalog. Honors the display
// configurator's column order + visibility, supports header sorting, and opens
// an artifact on row click.

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  Badge,
  cn,
  type SortOrder,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminArtifactRow } from "../../artifacts/artifacts-api";
import { buildArtifactDetailPath } from "../agents-workspace/agent-workspace-paths";
import { formatRelativeDate } from "../agents-workspace/date-format";
import {
  creatorLabel,
  describeStorage,
  resolveGroupHeader,
  scopeLabel,
  statusLabel,
} from "./artifacts-catalog-display";
import {
  type ArtifactCatalogGroup,
  type ArtifactGroupBy,
  type ArtifactSortBy,
  shortArtifactId,
} from "./artifacts-catalog-state";
import type {
  ArtifactColumnKey,
  ArtifactColumnVisibility,
} from "./artifacts-catalog-toolbar";

const rowBodyBaseClass = cn(
  "[--ui-canvas-row-divider-w:0px]",
  "[&>tr:hover>td]:bg-muted/50 [&>tr>td]:bg-card",
  "[&>tr>td:first-child]:pl-4"
);

const groupCardChromeClass = cn(
  "ui-canvas-raised rounded-md",
  "[&>tr:first-child>td:first-child]:rounded-tl-md",
  "[&>tr:first-child>td:last-child]:rounded-tr-md",
  "[&>tr:last-child>td:first-child]:rounded-bl-md",
  "[&>tr:last-child>td:last-child]:rounded-br-md"
);

const SORTABLE: Partial<Record<ArtifactColumnKey, ArtifactSortBy>> = {
  title: "title",
  type: "type",
  updated: "updated_at",
};

interface ArtifactsCatalogTableProps {
  columnOrder: ArtifactColumnKey[];
  columnVisibility: ArtifactColumnVisibility;
  groupBy: ArtifactGroupBy;
  groups: ArtifactCatalogGroup[];
  isGroupOpen: (id: string) => boolean;
  onSortChange: (value: ArtifactSortBy) => void;
  onToggleGroup: (id: string) => void;
  sortBy: ArtifactSortBy;
  sortOrder: SortOrder;
}

export function ArtifactsCatalogTable({
  columnOrder,
  columnVisibility,
  groupBy,
  groups,
  isGroupOpen,
  onSortChange,
  onToggleGroup,
  sortBy,
  sortOrder,
}: ArtifactsCatalogTableProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const grouped = groupBy !== "none";

  const visibleColumns = columnOrder.filter((key) => columnVisibility[key]);
  const colSpan = Math.max(1, visibleColumns.length);

  const groupCountLabel = (count: number) =>
    `${count} ${
      count === 1
        ? t("artifactsCatalog.groupCountSingular")
        : t("artifactsCatalog.groupCountPlural")
    }`;

  const headerLabel: Record<ArtifactColumnKey, string> = {
    creator: t("artifactsCatalog.column.creator"),
    scope: t("artifactsCatalog.column.scope"),
    status: t("artifactsCatalog.column.status"),
    storage: t("artifactsCatalog.column.storage"),
    title: t("artifactsCatalog.column.title"),
    type: t("artifactsCatalog.column.type"),
    updated: t("artifactsCatalog.column.updated"),
    version: t("artifactsCatalog.column.version"),
  };

  const renderHeadCell = (key: ArtifactColumnKey) => {
    const sortKey = SORTABLE[key];
    if (!sortKey) {
      return <TableHead key={key}>{headerLabel[key]}</TableHead>;
    }
    const active = sortBy === sortKey;
    const SortIcon = active
      ? sortOrder === "asc"
        ? ArrowUp
        : ArrowDown
      : ChevronsUpDown;
    return (
      <TableHead key={key}>
        <button
          className="-ml-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
          onClick={() => onSortChange(sortKey)}
          type="button"
        >
          {headerLabel[key]}
          <SortIcon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0",
              active ? "text-foreground" : "text-muted-foreground/60"
            )}
          />
        </button>
      </TableHead>
    );
  };

  const renderBodyCell = (key: ArtifactColumnKey, row: AdminArtifactRow) => {
    switch (key) {
      case "title":
        return (
          <TableCell key={key}>
            <p className="truncate font-medium text-sm">{row.title}</p>
            <p
              className="truncate font-mono text-muted-foreground text-xs"
              title={row.id}
            >
              {shortArtifactId(row.id)}
            </p>
          </TableCell>
        );
      case "scope": {
        return (
          <TableCell key={key}>
            <div className="flex items-center gap-1.5">
              <Badge className="shrink-0" variant="secondary">
                {scopeLabel(t, row.scope_type)}
              </Badge>
              <span
                className="truncate font-mono text-muted-foreground text-xs"
                title={row.scope_id}
              >
                {shortArtifactId(row.scope_id)}
              </span>
            </div>
          </TableCell>
        );
      }
      case "storage": {
        const storage = describeStorage(t, row.storage);
        return (
          <TableCell className="text-muted-foreground text-sm" key={key}>
            <span className="inline-flex items-center gap-1.5">
              <storage.Icon aria-hidden className="size-3.5 shrink-0" />
              {storage.label}
            </span>
          </TableCell>
        );
      }
      case "type":
        return (
          <TableCell key={key}>
            <Badge className="font-mono text-[10px]" variant="secondary">
              {row.type}
            </Badge>
          </TableCell>
        );
      case "version":
        return (
          <TableCell
            className="font-mono text-muted-foreground text-sm"
            key={key}
          >
            v{row.current_version}
          </TableCell>
        );
      case "updated":
        return (
          <TableCell className="text-muted-foreground text-sm" key={key}>
            {formatRelativeDate(row.updated_at) ?? "—"}
          </TableCell>
        );
      case "status":
        return (
          <TableCell key={key}>
            <Badge
              variant={row.status === "archived" ? "outline" : "secondary"}
            >
              {statusLabel(t, row.status)}
            </Badge>
          </TableCell>
        );
      default:
        return (
          <TableCell className="text-muted-foreground text-sm" key={key}>
            {creatorLabel(t, row.created_by_kind)}
          </TableCell>
        );
    }
  };

  return (
    <Table className="mb-2" noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow className="group hover:bg-transparent [&>th:first-child]:pl-4">
          {visibleColumns.map((key) => renderHeadCell(key))}
        </TableRow>
      </TableHeader>
      {groups.map((group) => {
        const open = grouped ? isGroupOpen(group.id) : true;
        const header = resolveGroupHeader(t, groupBy, group.id);
        return (
          <Fragment key={group.id}>
            {grouped ? (
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="border-0 bg-transparent px-0 pt-4 pb-1"
                    colSpan={colSpan}
                  >
                    <AdminListGroupHeader
                      count={groupCountLabel(group.rows.length)}
                      onToggle={() => onToggleGroup(group.id)}
                      open={open}
                      toggleLabel={t("artifactsCatalog.toggleGroup")}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <header.Icon
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <AdminListGroupPill>{header.label}</AdminListGroupPill>
                        {header.sub ? (
                          <span className="truncate text-muted-foreground text-xs">
                            {header.sub}
                          </span>
                        ) : null}
                      </span>
                    </AdminListGroupHeader>
                  </TableCell>
                </TableRow>
              </TableBody>
            ) : null}
            {open ? (
              <TableBody
                className={cn(
                  rowBodyBaseClass,
                  grouped && groupCardChromeClass
                )}
              >
                {group.rows.map((row) => (
                  <TableRow
                    className="cursor-pointer"
                    key={row.id}
                    onClick={() =>
                      navigate(buildArtifactDetailPath(row.id), {
                        state: { row },
                      })
                    }
                  >
                    {visibleColumns.map((key) => renderBodyCell(key, row))}
                  </TableRow>
                ))}
              </TableBody>
            ) : null}
          </Fragment>
        );
      })}
    </Table>
  );
}
