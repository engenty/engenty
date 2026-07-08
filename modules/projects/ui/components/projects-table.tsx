import { useTranslation } from "@engenty/i18n/ui";
import type { AvatarStackProfile } from "@engenty/ui-core";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  AvatarStack,
  cn,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { ExternalLink, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { deleteProject, type ProjectListItem } from "../api.js";
import { getProjectDisplayProfiles } from "../lib/project-display-members.js";
import type { ProjectsListGroup } from "../lib/project-list-grouping.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { ProjectsDeleteConfirmDialog } from "./projects-delete-confirm-dialog.js";
import type {
  ProjectsColumnVisibility,
  ProjectsSortColumn,
} from "./projects-display-dialog.js";

/** Per-group rows: bg-card cells, hover/selected wash, no inner dividers. */
const rowBodyBaseClass = cn(
  "[--ui-canvas-row-divider-w:0px]",
  "[&>tr:hover>td]:bg-muted/50 [&>tr>td]:bg-card",
  "[&>tr[data-state=selected]>td]:bg-muted/50"
);

/** Per-group card chrome — only when grouped (a flat list gets no card). */
const groupCardChromeClass = cn(
  "ui-canvas-raised rounded-md",
  "[&>tr:first-child>td:first-child]:rounded-tl-md",
  "[&>tr:first-child>td:last-child]:rounded-tr-md",
  "[&>tr:last-child>td:first-child]:rounded-bl-md",
  "[&>tr:last-child>td:last-child]:rounded-br-md"
);

const COLUMN_TO_SORT: Partial<
  Record<keyof ProjectsColumnVisibility, ProjectsSortColumn>
> = {
  title: "title",
  startDate: "start_date",
  endDate: "end_date",
};

type TableSize = "compact" | "normal";

function formatDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "-";
}

interface ProjectsTableProps {
  columnOrder: (keyof ProjectsColumnVisibility)[];
  columnVisibility: ProjectsColumnVisibility;
  grouped: boolean;
  groups: ProjectsListGroup[];
  isGroupOpen: (id: string) => boolean;
  memberProfileMap: Map<string, AvatarStackProfile>;
  onDataChange: () => void;
  onRowClick: (project: ProjectListItem) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSortChange: (column: ProjectsSortColumn) => void;
  onToggleGroup: (id: string) => void;
  selectedIds: Set<string>;
  showTeamMembers?: boolean;
  sortBy: ProjectsSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
  teamMemberCatalog: TeamMemberCatalogRow[];
}

export function ProjectsTable({
  groups,
  grouped,
  isGroupOpen,
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
  onToggleGroup,
  onDataChange,
  teamMemberCatalog,
  memberProfileMap,
  showTeamMembers = true,
}: ProjectsTableProps) {
  const { t } = useTranslation("projects");

  const projects = groups.flatMap((group) => group.projects);
  const visibleColumnCount = columnOrder.filter(
    (key) => columnVisibility[key]
  ).length;
  const subheadlineColSpan = visibleColumnCount + 2;

  const allSelected =
    projects.length > 0 && selectedIds.size === projects.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < projects.length;

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteOne = async (options: { deleteTasks: boolean }) => {
    if (!deletingId) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteProject(deletingId, { deleteTasks: options.deleteTasks });
      onDataChange();
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  const labels: Record<keyof ProjectsColumnVisibility, string> = {
    title: t("list.columns.title"),
    client: t("list.columns.client"),
    startDate: t("list.columns.startDate"),
    endDate: t("list.columns.endDate"),
    team: t("list.columns.team"),
  };

  const compact = tableSize === "compact";

  return (
    <>
      <Table className="mb-2" noWrapper>
        <TableHeader className={STICKY_HEADER_CLASS}>
          <TableRow
            className={`group hover:bg-transparent ${compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"}`}
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
                  <TableSortableHeader<ProjectsSortColumn>
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
        {groups.map((group) => {
          const open = grouped ? isGroupOpen(group.key) : true;
          return (
            <Fragment key={group.key}>
              {grouped && group.label ? (
                <TableBody>
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      className="border-0 bg-transparent px-0 pt-4 pb-1"
                      colSpan={subheadlineColSpan}
                    >
                      <AdminListGroupHeader
                        count={`${group.projects.length}`}
                        onToggle={() => onToggleGroup(group.key)}
                        open={open}
                        toggleLabel={t("filters.toggleGroup", {
                          defaultValue: "Toggle group",
                        })}
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
                  {group.projects.map((p) => (
                    <TableRow
                      className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
                      data-state={
                        selectedIds.has(p.id) ? "selected" : undefined
                      }
                      key={p.id}
                      onClick={() => onRowClick(p)}
                    >
                      <TableSelectionCell
                        checked={selectedIds.has(p.id)}
                        compact={compact}
                        hoverReveal
                        id={p.id}
                        onCheckedChange={onSelectOne}
                      />
                      {columnOrder.map((key) => {
                        if (!columnVisibility[key]) {
                          return null;
                        }
                        const cell =
                          key === "title"
                            ? p.title
                            : key === "client"
                              ? (p.client_name ?? p.client_id ?? "—")
                              : key === "startDate"
                                ? formatDate(p.start_date)
                                : key === "endDate"
                                  ? formatDate(p.end_date)
                                  : key === "team"
                                    ? (() => {
                                        if (!showTeamMembers) {
                                          return "—";
                                        }
                                        const profiles =
                                          getProjectDisplayProfiles(
                                            p,
                                            teamMemberCatalog,
                                            memberProfileMap
                                          );
                                        if (profiles.length === 0) {
                                          return "—";
                                        }
                                        return (
                                          <AvatarStack
                                            max={4}
                                            profiles={profiles}
                                            size="sm"
                                          />
                                        );
                                      })()
                                    : "—";
                        return (
                          <TableCell
                            className={key === "title" ? "font-medium" : ""}
                            key={key}
                          >
                            {cell}
                          </TableCell>
                        );
                      })}
                      <TableRowActions compact={compact}>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowClick(p);
                          }}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {t("viewProject", { defaultValue: "View project" })}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(p.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("delete")}
                        </DropdownMenuItem>
                      </TableRowActions>
                    </TableRow>
                  ))}
                </TableBody>
              ) : null}
            </Fragment>
          );
        })}
      </Table>

      <ProjectsDeleteConfirmDialog
        isDeleting={isDeleting}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDeleteOne}
        open={deletingId !== null}
        projectId={deletingId}
      />
    </>
  );
}
