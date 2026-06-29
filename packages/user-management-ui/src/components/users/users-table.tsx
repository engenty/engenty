import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  DropdownMenuItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
} from "@engenty/ui-core";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import type { UserListEnrichmentState } from "../../hooks/use-user-list-enrichments.js";
import type { UserRecord } from "../../lib/schemas.js";
import type { UserTableColumnConfig } from "./columns.js";
import type { UserColumnVisibility } from "./types.js";

interface UsersTableProps {
  allSelected: boolean;
  columnOrder: string[];
  columns: UserTableColumnConfig[];
  columnVisibility: UserColumnVisibility;
  currentUserId: string | null;
  enrichments: UserListEnrichmentState;
  isAdmin: boolean;
  onNavigate: (to: string) => void;
  onOpenUser: (userId: string) => void;
  onRoleChange: (userId: string, role: "admin" | "member") => void;
  onToggleSelectAll: (checked: boolean | "indeterminate") => void;
  onToggleSelectOne: (userId: string, checked: boolean) => void;
  selectedIds: Set<string>;
  someSelected: boolean;
  tableSize?: "compact" | "normal";
  users: UserRecord[];
}

export function UsersTable({
  users,
  tableSize = "normal",
  columns,
  currentUserId,
  selectedIds,
  allSelected,
  someSelected,
  isAdmin,
  enrichments,
  columnVisibility,
  columnOrder,
  onToggleSelectAll,
  onToggleSelectOne,
  onRoleChange,
  onOpenUser,
  onNavigate,
}: UsersTableProps) {
  const { t } = useTranslation("common");
  const columnsByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns]
  );
  const visibleColumns = useMemo(
    () =>
      columnOrder.filter(
        (key) => columnVisibility[key] && columnsByKey.has(key)
      ),
    [columnOrder, columnVisibility, columnsByKey]
  );

  const compact = tableSize === "compact";

  return (
    <Table noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={`group border-b-0 hover:bg-transparent ${
            compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"
          }`}
        >
          {isAdmin && (
            <TableSelectionHeader
              aria-label="Select all"
              checked={
                someSelected && !allSelected ? "indeterminate" : allSelected
              }
              compact={compact}
              onCheckedChange={onToggleSelectAll}
            />
          )}
          <TableHead className={compact ? "!py-1.5 h-8" : ""}>
            {t("usersTable.name")}
          </TableHead>
          {visibleColumns.map((key) => (
            <TableHead className={compact ? "!py-1.5 h-8" : ""} key={key}>
              {columnsByKey.get(key)?.labelKey
                ? t(columnsByKey.get(key)?.labelKey ?? key)
                : (columnsByKey.get(key)?.label ?? key)}
            </TableHead>
          ))}
          {isAdmin && (
            <TableHead
              className={`w-[40px] px-1 ${compact ? "!py-1.5 h-8" : ""}`}
            />
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              className="h-24 text-center text-muted-foreground text-sm"
              colSpan={2 + visibleColumns.length + (isAdmin ? 1 : 0)}
            >
              {t("usersTable.noUsersFound")}
            </TableCell>
          </TableRow>
        ) : (
          users.map((user) => {
            const isCurrentUser = user.id === currentUserId;
            const isSelected = selectedIds.has(user.id);

            return (
              <TableRow
                className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
                data-state={isSelected ? "selected" : undefined}
                key={user.id}
                onClick={() => isAdmin && onOpenUser(user.id)}
              >
                {isAdmin &&
                  (isCurrentUser ? (
                    <TableCell
                      className={`w-[36px] min-w-[30px] px-0 ${compact ? "!py-1.5" : ""}`}
                    >
                      <div className="w-4" />
                    </TableCell>
                  ) : (
                    <TableSelectionCell
                      aria-label={`Select ${user.display_name ?? user.email}`}
                      checked={isSelected}
                      compact={compact}
                      hoverReveal
                      id={user.id}
                      onCheckedChange={onToggleSelectOne}
                    />
                  ))}
                <TableCell className="font-medium text-sm">
                  <div className="flex items-center gap-2">
                    {user.display_name || user.email || "Unknown user"}
                    {isCurrentUser && (
                      <Badge className="text-xs" variant="outline">
                        {t("usersTable.you")}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {visibleColumns.map((key) => {
                  const column = columnsByKey.get(key);
                  const rowEnrichments = enrichments[user.id] ?? {};
                  if (column?.renderCell) {
                    return (
                      <TableCell
                        className="text-muted-foreground text-sm"
                        key={key}
                      >
                        {column.renderCell({
                          enrichments: rowEnrichments,
                          isAdmin,
                          isCurrentUser,
                          navigate: onNavigate,
                          user,
                        })}
                      </TableCell>
                    );
                  }
                  if (key === "contact") {
                    return (
                      <TableCell
                        className="text-muted-foreground text-sm"
                        key={key}
                      >
                        <div className="space-y-0.5">
                          {user.email && (
                            <div className="text-xs">{user.email}</div>
                          )}
                          {user.phone && (
                            <div className="text-xs">{user.phone}</div>
                          )}
                          {!(user.email || user.phone) && "-"}
                        </div>
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell key={key} onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <Select
                          disabled={isCurrentUser}
                          onValueChange={(value) =>
                            onRoleChange(user.id, value as "admin" | "member")
                          }
                          value={user.role}
                        >
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">
                              {t("usersTable.member")}
                            </SelectItem>
                            <SelectItem value="admin">
                              {t("usersTable.admin")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          className="text-xs"
                          variant={
                            user.role === "admin" ? "default" : "secondary"
                          }
                        >
                          {user.role}
                        </Badge>
                      )}
                    </TableCell>
                  );
                })}
                {isAdmin && (
                  <TableRowActions compact={compact}>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenUser(user.id);
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t("usersTable.viewUser")}
                    </DropdownMenuItem>
                  </TableRowActions>
                )}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
