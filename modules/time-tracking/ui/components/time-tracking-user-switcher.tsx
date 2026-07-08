import { useTranslation } from "@engenty/i18n/ui";
import { ContextPopoverList, cn, Input } from "@engenty/ui-core";
import { ChevronDown, Search, User } from "lucide-react";
import { useMemo, useState } from "react";
import type { TeamMemberOption } from "../api.js";

interface TimeTrackingUserSwitcherProps {
  currentUser: TeamMemberOption | null;
  isAdmin: boolean;
  onSelect: (userId: string) => void;
  selectedUser: string;
  teamMembersAvailable: boolean;
  users: TeamMemberOption[];
}

export function TimeTrackingUserSwitcher({
  users,
  selectedUser,
  onSelect,
  currentUser,
  isAdmin,
  teamMembersAvailable,
}: TimeTrackingUserSwitcherProps) {
  const { t } = useTranslation("time-tracking");
  const [search, setSearch] = useState("");

  const activeUser = users.find((u) => u.id === selectedUser) || currentUser;
  const label = activeUser?.full_name || t("selectUser", "Select User");
  const showSearch = users.length > 6;

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return users;
    }
    return users.filter((user) => user.full_name.toLowerCase().includes(q));
  }, [users, search]);

  const items = useMemo(
    () =>
      filteredUsers.map((user) => ({
        id: user.id,
        label: user.full_name,
        icon: <User className="size-4" />,
        isActive: user.id === selectedUser,
        onClick: () => onSelect(user.id),
      })),
    [filteredUsers, selectedUser, onSelect]
  );

  const searchHeader = showSearch ? (
    <div className="pb-1">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={t("searchUsers", "Search users…")}
          autoComplete="off"
          className="h-8 border-border/60 bg-muted/40 pl-8 text-sm"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder={t("searchUsers", "Search users…")}
          value={search}
        />
      </div>
    </div>
  ) : null;

  if (!(isAdmin && teamMembersAvailable) || users.length <= 1) {
    return <span className="font-medium text-foreground text-sm">{label}</span>;
  }

  const trigger = (
    <button
      aria-label={t("selectUser", "Select User")}
      className="group/picker inline-flex max-w-[min(20rem,85vw)] items-center gap-0.5 rounded px-0.5 font-medium text-foreground text-sm transition-colors hover:text-foreground"
      type="button"
    >
      <span className="min-w-0 truncate">{label}</span>
      <ChevronDown
        aria-hidden
        className="size-3 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover/picker:opacity-100 group-data-[state=open]/picker:opacity-100"
      />
    </button>
  );

  return (
    <ContextPopoverList
      align="start"
      className={cn("min-w-56 p-1.5", showSearch && "w-72")}
      emptyMessage={
        search.trim() ? t("noUsersFound", "No users found") : undefined
      }
      header={searchHeader}
      items={items}
      onOpenChange={(open) => {
        if (!open) {
          setSearch("");
        }
      }}
      openOn="click"
      trigger={trigger}
    />
  );
}
