import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
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
import { ExternalLink } from "lucide-react";
import type { ManageUser } from "@/lib/api/users";
import type {
  UsersColumnVisibility,
  UsersSortColumn,
} from "./users-list-display";

const COLUMN_TO_SORT: Partial<
  Record<keyof UsersColumnVisibility, UsersSortColumn>
> = {
  email: "email",
  displayName: "display_name",
  createdAt: "created_at",
};

type TableSize = "compact" | "normal";

interface UsersTableProps {
  columnOrder: (keyof UsersColumnVisibility)[];
  columnVisibility: UsersColumnVisibility;
  onRowClick: (user: ManageUser) => void;
  onSortChange: (column: UsersSortColumn) => void;
  sortBy: UsersSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
  tenantName: (tenantId: string) => string;
  users: ManageUser[];
}

export function UsersTable({
  users,
  tenantName,
  columnVisibility,
  columnOrder,
  sortBy,
  sortOrder,
  tableSize,
  onSortChange,
  onRowClick,
}: UsersTableProps) {
  const { t } = useTranslation("common");
  const compact = tableSize === "compact";

  const labels: Record<keyof UsersColumnVisibility, string> = {
    displayName: t("users.create.nameLabel"),
    email: t("common.email"),
    primaryTenant: t("users.primaryTenant"),
    role: t("common.role"),
    superAdmin: t("users.superAdmin"),
    createdAt: t("common.created"),
  };

  return (
    <Table noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={`group border-b-0 hover:bg-transparent ${compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"}`}
        >
          {columnOrder.map((key) => {
            if (!columnVisibility[key]) {
              return null;
            }
            const sortColumn = COLUMN_TO_SORT[key];
            if (sortColumn) {
              return (
                <TableSortableHeader<UsersSortColumn>
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
      <TableBody>
        {users.map((user) => (
          <TableRow
            className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
            key={user.id}
            onClick={() => onRowClick(user)}
          >
            {columnOrder.map((key) => {
              if (!columnVisibility[key]) {
                return null;
              }
              if (key === "superAdmin") {
                return (
                  <TableCell key={key}>
                    {user.is_super_admin ? (
                      <Badge variant="outline">{t("users.superAdmin")}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                );
              }
              const val =
                key === "displayName"
                  ? (user.display_name ?? user.email)
                  : key === "email"
                    ? user.email
                    : key === "primaryTenant"
                      ? tenantName(user.tenant_id)
                      : key === "role"
                        ? user.role
                        : user.created_at
                          ? new Date(user.created_at).toLocaleDateString()
                          : "—";
              return (
                <TableCell
                  className={
                    key === "displayName"
                      ? "font-medium"
                      : key === "email"
                        ? "text-muted-foreground"
                        : undefined
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
                  onRowClick(user);
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("users.list.viewUser")}
              </DropdownMenuItem>
            </TableRowActions>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
