// Grouped table view for the activity list. Honors the display configurator's
// column order + visibility, supports header sorting, and opens the session
// detail on row click (rows without an agent are not navigable).

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
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
import { ArrowDown, ArrowUp, Bot, ChevronsUpDown } from "lucide-react";
import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { buildAgentSessionDetailPath } from "../agents-workspace/agent-workspace-paths";
import { formatRelativeDate } from "../agents-workspace/date-format";
import type { ActivityEntry } from "./activity-entries";
import { ActivityStatusDot } from "./activity-feed-item";
import {
  activityStatusLabel,
  resolveActivityGroupHeader,
  shortActivityId,
} from "./activity-list-display";
import type {
  ActivityGroupBy,
  ActivityListGroup,
  ActivitySortBy,
} from "./activity-list-state";
import type {
  ActivityColumnKey,
  ActivityColumnVisibility,
} from "./activity-toolbar";

const rowBodyBaseClass = cn(
  "[--ui-canvas-row-divider-w:0px]",
  "[&>tr:hover>td]:bg-muted/50 [&>tr>td]:bg-card",
  "[&>tr>td:first-child]:pl-4"
);

const groupCardChromeClass = cn(
  "ui-card-raised",
  "[&>tr:first-child>td:first-child]:rounded-tl-md",
  "[&>tr:first-child>td:last-child]:rounded-tr-md",
  "[&>tr:last-child>td:first-child]:rounded-bl-md",
  "[&>tr:last-child>td:last-child]:rounded-br-md"
);

const SORTABLE: Partial<Record<ActivityColumnKey, ActivitySortBy>> = {
  agent: "agent",
  title: "title",
  updated: "timestamp",
};

interface ActivityTableProps {
  agentNameById: Map<string, string>;
  columnOrder: ActivityColumnKey[];
  columnVisibility: ActivityColumnVisibility;
  groupBy: ActivityGroupBy;
  groups: ActivityListGroup[];
  isGroupOpen: (id: string) => boolean;
  onSortChange: (value: ActivitySortBy) => void;
  onToggleGroup: (id: string) => void;
  sortBy: ActivitySortBy;
  sortOrder: SortOrder;
}

export function ActivityTable({
  agentNameById,
  columnOrder,
  columnVisibility,
  groupBy,
  groups,
  isGroupOpen,
  onSortChange,
  onToggleGroup,
  sortBy,
  sortOrder,
}: ActivityTableProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const grouped = groupBy !== "none";

  const visibleColumns = columnOrder.filter((key) => columnVisibility[key]);
  const colSpan = Math.max(1, visibleColumns.length);

  const groupCountLabel = (count: number) =>
    `${count} ${
      count === 1
        ? t("activity.groupCountSingular")
        : t("activity.groupCountPlural")
    }`;

  const headerLabel: Record<ActivityColumnKey, string> = {
    agent: t("activity.column.agent"),
    binding: t("activity.column.binding"),
    status: t("activity.column.status"),
    title: t("activity.column.title"),
    updated: t("activity.column.updated"),
    user: t("activity.column.user"),
  };

  const renderHeadCell = (key: ActivityColumnKey) => {
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

  const renderBodyCell = (key: ActivityColumnKey, entry: ActivityEntry) => {
    switch (key) {
      case "status":
        return (
          <TableCell key={key}>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
              <ActivityStatusDot entry={entry} />
              {activityStatusLabel(t, entry.statusKind)}
            </span>
          </TableCell>
        );
      case "agent":
        return (
          <TableCell key={key}>
            <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground text-sm">
              <Bot aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">
                {entry.agentId
                  ? (agentNameById.get(entry.agentId) ?? entry.agentId)
                  : t("activity.noAgent")}
              </span>
            </span>
          </TableCell>
        );
      case "title":
        return (
          <TableCell key={key}>
            <p className="truncate font-medium text-sm">
              {entry.title ?? t("activity.untitledSession")}
            </p>
          </TableCell>
        );
      case "user":
        return (
          <TableCell key={key}>
            {entry.userId ? (
              <span
                className="font-mono text-muted-foreground text-xs"
                title={entry.userId}
              >
                {shortActivityId(entry.userId)}
              </span>
            ) : (
              // Unattended work — a routine fire or a task run. It has no
              // owner by design, so there is no id to shorten; saying so beats
              // an eight-character slice of nothing.
              <span className="text-muted-foreground text-xs">
                {t("activity.unattendedOwner")}
              </span>
            )}
          </TableCell>
        );
      case "binding":
        return (
          <TableCell key={key}>
            {entry.hostKey ? (
              <span
                className="truncate font-mono text-muted-foreground text-xs"
                title={entry.hostKey}
              >
                {entry.hostKey}
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">—</span>
            )}
          </TableCell>
        );
      default:
        return (
          <TableCell className="text-muted-foreground text-sm" key={key}>
            {formatRelativeDate(entry.timestamp) ?? entry.timestamp}
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
        const header = resolveActivityGroupHeader(
          t,
          groupBy,
          group,
          agentNameById
        );
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
                      count={groupCountLabel(group.entries.length)}
                      onToggle={() => onToggleGroup(group.id)}
                      open={open}
                      toggleLabel={t("activity.toggleGroup")}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <header.Icon
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <AdminListGroupPill>{header.label}</AdminListGroupPill>
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
                {group.entries.map((entry) => (
                  <TableRow
                    className={entry.agentId ? "cursor-pointer" : undefined}
                    key={entry.key}
                    onClick={
                      entry.agentId
                        ? () =>
                            navigate(
                              buildAgentSessionDetailPath(
                                entry.agentId as string,
                                entry.entityId
                              )
                            )
                        : undefined
                    }
                  >
                    {visibleColumns.map((key) => renderBodyCell(key, entry))}
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
