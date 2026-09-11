import {
  AdminListGroupHeader,
  AdminListGroupPill,
  Badge,
  cn,
  DropdownMenuItem,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableSortableHeader,
} from "@engenty/ui-core";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Fragment } from "react";
import type {
  NormalizedSkillRecord,
  SkillCatalogGroup,
  SkillCatalogGroupBy,
  SkillCatalogSortBy,
} from "./skills-catalog-state";
import type {
  SkillCatalogColumnKey,
  SkillCatalogColumnVisibility,
} from "./skills-catalog-toolbar";

export function displayName(
  skill: Pick<NormalizedSkillRecord, "name" | "title">
) {
  return skill.title?.trim() || skill.name;
}

export function SkillStatusBadge({
  labels,
  skill,
}: {
  labels: { managed: string; uploaded: string };
  skill: Pick<NormalizedSkillRecord, "source_reference" | "tier">;
}) {
  const custom = skill.tier === "custom";
  const label = custom
    ? formatCustomSkillSource(skill.source_reference, labels.uploaded)
    : labels.managed;
  return (
    <Badge
      className={cn(
        "border-border bg-card font-normal text-[11px]",
        custom ? "text-primary" : "text-muted-foreground"
      )}
      variant="outline"
    >
      {label}
    </Badge>
  );
}

function formatCustomSkillSource(source: string | null, uploadedLabel: string) {
  const normalized = source?.trim();
  if (!normalized || normalized === "upload" || normalized === "uploaded") {
    return uploadedLabel;
  }
  if (normalized === "skills_sh") {
    return "skills.sh";
  }
  return normalized;
}

interface SkillCatalogTableLabels {
  columnActions: string;
  columnModule: string;
  columnSandbox: string;
  columnSkill: string;
  columnStatus: string;
  columnTools: string;
  columnUpdated: string;
  delete: string;
  edit: string;
  groupCountPlural: string;
  groupCountSingular: string;
  managed: string;
  needsSandbox: string;
  noSandbox: string;
  open: string;
  toggleGroup: string;
  uploaded: string;
}

interface SkillCatalogTableProps {
  columnOrder: SkillCatalogColumnKey[];
  columnVisibility: SkillCatalogColumnVisibility;
  deletePending: boolean;
  groupBy: SkillCatalogGroupBy;
  groups: SkillCatalogGroup[];
  isGroupOpen: (id: string) => boolean;
  labels: SkillCatalogTableLabels;
  onDelete: (skillName: string) => void;
  onEdit: (skillName: string) => void;
  onOpen: (skillName: string) => void;
  onSortChange: (column: SkillCatalogSortBy) => void;
  onToggleGroup: (id: string) => void;
  sortBy: SkillCatalogSortBy;
  sortOrder: "asc" | "desc";
  tableSize: "compact" | "normal";
}

function groupCountLabel(
  count: number,
  labels: Pick<
    SkillCatalogTableLabels,
    "groupCountPlural" | "groupCountSingular"
  >
) {
  return `${count} ${count === 1 ? labels.groupCountSingular : labels.groupCountPlural}`;
}

const COLUMN_TO_SORT: Partial<
  Record<SkillCatalogColumnKey, SkillCatalogSortBy>
> = {
  module: "module",
  skill: "name",
  updated: "updated_at",
};

/**
 * Base styling for a group's `<TableBody>`: `bg-card` cells, hover wash, and no
 * inner row dividers (`--ui-canvas-row-divider-w:0px`). Always applied. When
 * grouped, {@link groupCardChromeClass} adds the borderless soft-shadow card
 * (`ui-card-raised`, per DESIGN.md) on top; a flat (ungrouped) list gets none.
 */
const rowBodyBaseClass = cn(
  "[--ui-canvas-row-divider-w:0px]",
  "[&>tr:hover>td]:bg-muted/50 [&>tr>td]:bg-card",
  // No bulk-select column → give the first column a comfortable left inset.
  "[&>tr>td:first-child]:pl-4"
);

/** Per-group card chrome — only when grouped (a flat list gets no card). */
const groupCardChromeClass = cn(
  "ui-card-raised",
  "[&>tr:first-child>td:first-child]:rounded-tl-md",
  "[&>tr:first-child>td:last-child]:rounded-tr-md",
  "[&>tr:last-child>td:first-child]:rounded-bl-md",
  "[&>tr:last-child>td:last-child]:rounded-br-md"
);

export function formatUpdatedAt(value: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function SkillCatalogTable({
  columnOrder,
  columnVisibility,
  deletePending,
  groups,
  groupBy,
  isGroupOpen,
  labels,
  onDelete,
  onEdit,
  onOpen,
  onSortChange,
  onToggleGroup,
  sortBy,
  sortOrder,
  tableSize,
}: SkillCatalogTableProps) {
  const compact = tableSize === "compact";
  const visibleColumnCount = columnOrder.filter(
    (key) => columnVisibility[key]
  ).length;
  const subheadlineColSpan = visibleColumnCount + 1;
  const columnLabels: Record<SkillCatalogColumnKey, string> = {
    module: labels.columnModule,
    sandbox: labels.columnSandbox,
    skill: labels.columnSkill,
    status: labels.columnStatus,
    tools: labels.columnTools,
    updated: labels.columnUpdated,
  };

  return (
    <Table className="mb-2" noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={cn(
            "group hover:bg-transparent",
            "[&>th:first-child]:pl-4",
            compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"
          )}
        >
          {columnOrder.map((key) => {
            if (!columnVisibility[key]) {
              return null;
            }
            const sortColumn = COLUMN_TO_SORT[key];
            if (sortColumn) {
              return (
                <TableSortableHeader<SkillCatalogSortBy>
                  column={sortColumn}
                  compact={compact}
                  key={key}
                  onSort={onSortChange}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                >
                  {columnLabels[key]}
                </TableSortableHeader>
              );
            }
            return (
              <TableHead
                className={cn(
                  compact ? "!py-1.5 h-8" : "",
                  key === "tools" && "w-20",
                  key === "sandbox" && "w-28",
                  key === "status" && "w-28"
                )}
                key={key}
              >
                {columnLabels[key]}
              </TableHead>
            );
          })}
          <TableHead className={cn("w-[40px] px-1", compact && "!py-1.5 h-8")}>
            <span className="sr-only">{labels.columnActions}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      {groups.map((group) => {
        const grouped = groupBy !== "none";
        const open = grouped ? isGroupOpen(group.id) : true;
        return (
          <Fragment key={group.id}>
            {grouped ? (
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="border-0 bg-transparent px-0 pt-4 pb-1"
                    colSpan={subheadlineColSpan}
                  >
                    <AdminListGroupHeader
                      count={groupCountLabel(group.skills.length, labels)}
                      onToggle={() => onToggleGroup(group.id)}
                      open={open}
                      toggleLabel={labels.toggleGroup}
                    >
                      <AdminListGroupPill>{group.label}</AdminListGroupPill>
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
                {group.skills.map((skill) => {
                  const canModify =
                    skill.tier === "custom" || skill.editable === true;
                  return (
                    <TableRow
                      className={cn(
                        "group cursor-pointer",
                        compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"
                      )}
                      key={skill.name}
                      onClick={() => onOpen(skill.name)}
                    >
                      {columnOrder.map((key) => {
                        if (!columnVisibility[key]) {
                          return null;
                        }
                        if (key === "skill") {
                          return (
                            <TableCell className="min-w-[16rem]" key={key}>
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-baseline gap-2">
                                  <span className="truncate font-medium text-foreground">
                                    {displayName(skill)}
                                  </span>
                                  <span className="truncate font-mono text-muted-foreground text-xs">
                                    {skill.name}
                                  </span>
                                </div>
                                {skill.description ? (
                                  <p className="mt-0.5 line-clamp-1 max-w-2xl text-muted-foreground text-xs">
                                    {skill.description}
                                  </p>
                                ) : null}
                              </div>
                            </TableCell>
                          );
                        }
                        if (key === "module") {
                          return (
                            <TableCell
                              className="text-muted-foreground"
                              key={key}
                            >
                              <span className="line-clamp-1">
                                {skill.engenty_modules.join(", ") ||
                                  skill.module_id}
                              </span>
                            </TableCell>
                          );
                        }
                        if (key === "sandbox") {
                          return (
                            <TableCell key={key}>
                              <Badge
                                className={cn(
                                  "border-border bg-card font-normal text-[11px]",
                                  skill.requires_sandbox
                                    ? "text-primary"
                                    : "text-muted-foreground"
                                )}
                                variant="outline"
                              >
                                {skill.requires_sandbox
                                  ? labels.needsSandbox
                                  : labels.noSandbox}
                              </Badge>
                            </TableCell>
                          );
                        }
                        if (key === "status") {
                          return (
                            <TableCell key={key}>
                              <SkillStatusBadge
                                labels={{
                                  managed: labels.managed,
                                  uploaded: labels.uploaded,
                                }}
                                skill={skill}
                              />
                            </TableCell>
                          );
                        }
                        if (key === "tools") {
                          return (
                            <TableCell
                              className="text-muted-foreground tabular-nums"
                              key={key}
                            >
                              {skill.allowed_tools.length}
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell
                            className="whitespace-nowrap text-muted-foreground"
                            key={key}
                          >
                            {formatUpdatedAt(skill.updated_at)}
                          </TableCell>
                        );
                      })}
                      {canModify ? (
                        <TableRowActions compact={compact}>
                          <DropdownMenuItem
                            onClick={() => {
                              onEdit(skill.name);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {labels.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            disabled={deletePending}
                            onClick={() => {
                              onDelete(skill.name);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {labels.delete}
                          </DropdownMenuItem>
                        </TableRowActions>
                      ) : (
                        <TableRowActions compact={compact}>
                          <DropdownMenuItem
                            onClick={() => {
                              onOpen(skill.name);
                            }}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {labels.open}
                          </DropdownMenuItem>
                        </TableRowActions>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            ) : null}
          </Fragment>
        );
      })}
    </Table>
  );
}
