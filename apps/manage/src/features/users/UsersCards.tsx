import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName, Badge, cn } from "@engenty/ui-core";
import type { ReactNode } from "react";
import type { ManageUser } from "@/lib/api/users";
import type { UsersColumnVisibility } from "./users-list-display";

type TableSize = "compact" | "normal";

interface UsersCardsProps {
  columnOrder: (keyof UsersColumnVisibility)[];
  columnVisibility: UsersColumnVisibility;
  onCardClick: (user: ManageUser) => void;
  tableSize: TableSize;
  tenantName: (tenantId: string) => string;
  users: ManageUser[];
}

export function UsersCards({
  users,
  tableSize,
  columnOrder,
  columnVisibility,
  tenantName,
  onCardClick,
}: UsersCardsProps) {
  const { t } = useTranslation("common");
  const compact = tableSize === "compact";

  const fieldLabel = (key: keyof UsersColumnVisibility) => {
    switch (key) {
      case "displayName":
        return t("users.create.nameLabel");
      case "email":
        return t("common.email");
      case "primaryTenant":
        return t("users.primaryTenant");
      case "role":
        return t("common.role");
      case "superAdmin":
        return t("users.superAdmin");
      case "createdAt":
        return t("common.created");
      default:
        return key;
    }
  };

  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {users.map((user) => {
        const bodyKeys = columnOrder.filter(
          (key) => key !== "displayName" && columnVisibility[key]
        );
        const title = user.display_name ?? user.email;

        return (
          <button
            className={cn(
              "ui-canvas-raised w-full cursor-pointer rounded-lg border-0 bg-card text-left transition-[box-shadow,color]",
              compact ? "p-3" : "p-4"
            )}
            key={user.id}
            onClick={() => onCardClick(user)}
            type="button"
          >
            {columnVisibility.displayName ? (
              <h3 className="flex flex-wrap items-center gap-2 font-semibold leading-none tracking-tight">
                <span>{title}</span>
                {user.is_super_admin && !columnVisibility.superAdmin ? (
                  <Badge variant="outline">{t("users.superAdmin")}</Badge>
                ) : null}
              </h3>
            ) : null}
            <div
              className={cn(
                "flex flex-col text-muted-foreground text-sm",
                columnVisibility.displayName
                  ? compact
                    ? "mt-2 gap-1"
                    : "mt-3 gap-2"
                  : compact
                    ? "gap-1"
                    : "gap-2"
              )}
            >
              {bodyKeys.map((key) => {
                let value: ReactNode;
                if (key === "email") {
                  value = user.email;
                } else if (key === "primaryTenant") {
                  value = tenantName(user.tenant_id);
                } else if (key === "role") {
                  value = user.role;
                } else if (key === "superAdmin") {
                  value = user.is_super_admin ? (
                    <Badge variant="outline">{t("users.superAdmin")}</Badge>
                  ) : (
                    "—"
                  );
                } else {
                  value = user.created_at
                    ? new Date(user.created_at).toLocaleDateString()
                    : "—";
                }
                return (
                  <div
                    className="flex items-center justify-between gap-3"
                    key={key}
                  >
                    <span>{fieldLabel(key)}</span>
                    <span className="min-w-0 truncate text-foreground">
                      {value}
                    </span>
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
