import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  Badge,
  SettingsFormSection,
  Skeleton,
} from "@engenty/ui-core";
import { ChevronRightIcon, UsersIcon, UserCheckIcon, UserMinusIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserListQuery } from "@/hooks/use-user-list-query";

export function TenantUsersSettingsSection() {
  const { t } = useTranslation("common");
  const { data: users, isLoading } = useUserListQuery();

  // Limit to first 7 users for the preview
  const displayUsers = users?.slice(0, 7) ?? [];

  return (
    <SettingsFormSection
      cardVariant="flush"
      description="Manage members and permissions for this workspace."
      title="Users"
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
            <p className="text-sm text-muted-foreground">No users found.</p>
          </div>
        ) : (
          displayUsers.map((user) => (
            <div
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              key={user.id}
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/5 text-[10px] font-bold text-primary">
                  {user.initials || user.display_name?.[0] || user.email?.[0] || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {user.display_name || user.email}
                  </span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] uppercase tracking-wider">
                    {user.role}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{user.email}</span>
                  {user.teamMember ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
                      <span className="h-1 w-1 rounded-full bg-emerald-500" />
                      {user.teamMember.full_name}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                      <span className="h-1 w-1 rounded-full bg-amber-500" />
                      No team member
                    </span>
                  )}
                </div>
              </div>
              <ChevronRightIcon className="size-4 text-muted-foreground/40" />
            </div>
          ))
        )}
        <Link
          className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
          to="/admin/users"
        >
          <UsersIcon className="size-3" />
          Manage all users
        </Link>
      </div>
    </SettingsFormSection>
  );
}
