import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  SettingsFormSection,
  Skeleton,
} from "@engenty/ui-core";
import { USERS_PATH } from "@engenty/user-management-ui";
import { ChevronRightIcon, UsersIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserListQuery } from "@/hooks/use-user-list-query";

/** Build 2–3 letter initials from a display name. */
function deriveInitials(name: string | null | undefined): string {
  if (!name) {
    return "";
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return parts
    .slice(0, 3)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function TenantUsersSettingsSection() {
  const { t } = useTranslation("common");
  const { data: users, isLoading } = useUserListQuery();

  // Limit to first 7 users for the preview
  const displayUsers = users?.slice(0, 7) ?? [];

  return (
    <SettingsFormSection
      cardVariant="flush"
      description={t("settings.users.description")}
      title={t("settings.users.title")}
    >
      <div className="divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div className="flex items-center gap-3 px-4 py-3" key={i}>
              <Skeleton className="size-8 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))
        ) : displayUsers.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t("usersTable.noUsersFound")}
            </p>
          </div>
        ) : (
          displayUsers.map((user) => {
            const initials =
              user.initials ||
              deriveInitials(user.display_name) ||
              deriveInitials(user.email?.split("@")[0]) ||
              "?";

            return (
              <Link
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                key={user.id}
                to={`${USERS_PATH}/${user.id}`}
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/5 font-bold text-[10px] text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground text-sm">
                      {user.display_name || user.email}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0 font-semibold text-[10px] uppercase tracking-wider ${
                        user.role === "admin"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {user.role === "admin"
                        ? t("usersTable.admin")
                        : t("usersTable.member")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span className="truncate">{user.email}</span>
                    {user.teamMember ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
                        <span className="h-1 w-1 rounded-full bg-emerald-500" />
                        {user.teamMember.full_name}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                        <span className="h-1 w-1 rounded-full bg-amber-500" />
                        {t("settings.users.noTeamMember")}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRightIcon className="size-4 text-muted-foreground/40" />
              </Link>
            );
          })
        )}
        <Link
          className="flex items-center justify-center gap-2 px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
          to={USERS_PATH}
        >
          <UsersIcon className="size-3" />
          {t("settings.users.manageAll")}
        </Link>
      </div>
    </SettingsFormSection>
  );
}
