import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { ExternalLink, Trash2, User } from "lucide-react";
import { Fragment, useState } from "react";
import { deleteTeamMember, type TeamMemberListItem } from "../api.js";
import type { TeamMembersListGroup } from "../lib/team-members-list-grouping.js";
import { TeamMemberAvatar } from "./team-member-avatar.js";
import type {
  TeamMembersColumnVisibility,
  TeamMembersSortColumn,
} from "./team-members-display-dialog.js";

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
  Record<keyof TeamMembersColumnVisibility, TeamMembersSortColumn>
> = {
  fullName: "full_name",
  position: "position",
  department: "department",
};

type TableSize = "compact" | "normal";

interface TeamMembersTableProps {
  columnOrder: (keyof TeamMembersColumnVisibility)[];
  columnVisibility: TeamMembersColumnVisibility;
  grouped: boolean;
  groups: TeamMembersListGroup[];
  isGroupOpen: (id: string) => boolean;
  onDataChange: () => void;
  onRowClick: (member: TeamMemberListItem) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onSortChange: (column: TeamMembersSortColumn) => void;
  onToggleGroup: (id: string) => void;
  selectedIds: Set<string>;
  sortBy: TeamMembersSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
}

export function TeamMembersTable({
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
}: TeamMembersTableProps) {
  const { t } = useTranslation("team");

  const members = groups.flatMap((group) => group.members);
  const visibleColumnCount = columnOrder.filter(
    (key) => columnVisibility[key]
  ).length;
  const subheadlineColSpan = visibleColumnCount + 2;

  const allSelected = members.length > 0 && selectedIds.size === members.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < members.length;

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteOne = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteTeamMember(id);
      onDataChange();
    } finally {
      setDeletingId(null);
    }
  };

  const labels: Record<keyof TeamMembersColumnVisibility, string> = {
    avatar: t("avatar"),
    linkedUser: t("linkedUser"),
    fullName: t("fullName"),
    position: t("position"),
    department: t("department"),
    location: t("location"),
    phone: t("phone"),
    reportsTo: t("reportsTo"),
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
                  <TableSortableHeader<TeamMembersSortColumn>
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
                <TableHead
                  className={cn(
                    compact ? "!py-1.5 h-8" : "",
                    key === "avatar" && "w-[52px]",
                    key === "linkedUser" && "w-[36px] px-1"
                  )}
                  key={key}
                >
                  {key === "avatar" || key === "linkedUser" ? (
                    <span className="sr-only">{labels[key]}</span>
                  ) : (
                    labels[key]
                  )}
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
                        count={`${group.members.length}`}
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
                  {group.members.map((member) => {
                    const cellValue = (
                      key: keyof TeamMembersColumnVisibility
                    ) =>
                      key === "fullName"
                        ? member.full_name
                        : key === "position"
                          ? member.position || "-"
                          : key === "department"
                            ? member.department || "-"
                            : key === "location"
                              ? member.location || "-"
                              : key === "phone"
                                ? member.phone || "-"
                                : key === "reportsTo"
                                  ? (member.reports_to_display_name ??
                                    t("noManager"))
                                  : "-";

                    return (
                      <TableRow
                        className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
                        data-state={
                          selectedIds.has(member.id) ? "selected" : undefined
                        }
                        key={member.id}
                        onClick={() => onRowClick(member)}
                      >
                        <TableSelectionCell
                          checked={selectedIds.has(member.id)}
                          compact={compact}
                          hoverReveal
                          id={member.id}
                          onCheckedChange={onSelectOne}
                        />
                        {columnOrder.map((key) => {
                          if (!columnVisibility[key]) {
                            return null;
                          }
                          if (key === "avatar") {
                            return (
                              <TableCell className="w-[52px]" key={key}>
                                <TeamMemberAvatar
                                  compact={compact}
                                  fullName={member.full_name}
                                  initials={member.initials}
                                  storageKey={member.profile_image_storage_key}
                                  variant="table"
                                />
                              </TableCell>
                            );
                          }
                          if (key === "linkedUser") {
                            return (
                              <TableCell className="w-[36px] px-1" key={key}>
                                {member.user_id ? (
                                  <span
                                    aria-label={t("connectedUser")}
                                    className={cn(
                                      "flex items-center justify-center rounded-full border border-foreground/10 bg-muted",
                                      compact ? "h-6 w-6" : "h-7 w-7"
                                    )}
                                    role="img"
                                  >
                                    <User
                                      className={cn(
                                        "text-muted-foreground",
                                        compact ? "h-3.5 w-3.5" : "h-4 w-4"
                                      )}
                                    />
                                  </span>
                                ) : null}
                              </TableCell>
                            );
                          }
                          const val = cellValue(key);
                          return (
                            <TableCell
                              className={
                                key === "fullName" ? "font-medium" : ""
                              }
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
                              onRowClick(member);
                            }}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {t("viewMember", { defaultValue: "View member" })}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(member.id);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("delete")}
                          </DropdownMenuItem>
                        </TableRowActions>
                      </TableRow>
                    );
                  })}
                </TableBody>
              ) : null}
            </Fragment>
          );
        })}
      </Table>

      <AlertDialog
        onOpenChange={(open) => !open && setDeletingId(null)}
        open={deletingId !== null}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteMemberConfirm", {
                defaultValue: "Delete this team member?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteMemberConfirmDescription", {
                defaultValue: "This action cannot be undone.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deletingId}
              onClick={() => deletingId && void handleDeleteOne(deletingId)}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
