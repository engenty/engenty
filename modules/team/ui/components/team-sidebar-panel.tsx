import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  cn,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowButton,
  SidebarTab,
  SidebarTabStrip,
  Skeleton,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Bot,
  Building,
  List,
  ListFilter,
  type LucideIcon,
  MapPin,
  Plus,
  Search,
  Settings,
  User,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { TeamMemberListItem } from "../api.js";
import {
  type TeamAgentCatalogRow,
  useTeamAgentsCatalogQuery,
} from "../hooks/use-team-agents-catalog-query.js";
import {
  buildTeamMembersListGroups,
  type TeamMembersListGroup,
} from "../lib/team-members-list-grouping.js";
import {
  type TeamSidebarPrefs,
  useTeamSidebarPrefs,
} from "../lib/use-team-sidebar-prefs.js";
import { useTeamMembersListQuery } from "../queries.js";
import { teamFilterOptionsQueryOptions } from "../team-module-queries.js";
import {
  TEAM_AGENTS_PATH,
  TEAM_MODULE_BASE,
  TEAM_MODULE_SETTINGS_PATH,
  teamAgentDetailPath,
  teamMemberDetailPath,
} from "../team-paths.js";
import { TeamMemberCreateModal } from "./team-member-create-modal.js";

const SIDEBAR_FETCH_SIZE = 200;

// ---------- Shared row primitives ----------

function SidebarNavRow({
  active,
  icon: Icon,
  label,
  to,
}: {
  active: boolean;
  icon?: typeof Settings;
  label: string;
  to: string;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link to={to} {...shellSecondaryNavItemProps}>
          {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

function MemberSidebarRow({
  active,
  member,
}: {
  active: boolean;
  member: TeamMemberListItem;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link
          to={teamMemberDetailPath(member.id)}
          {...shellSecondaryNavItemProps}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{member.full_name}</span>
          </span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

function AgentSidebarRow({
  active,
  agent,
}: {
  active: boolean;
  agent: TeamAgentCatalogRow;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link
          to={teamAgentDetailPath(agent.id)}
          {...shellSecondaryNavItemProps}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Bot
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate">{agent.name}</span>
          </span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

function SidebarEntitySkeleton() {
  return (
    <div className="flex flex-col gap-1.5 pl-2">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton className="h-6 w-full" key={`skel-${i}`} />
      ))}
    </div>
  );
}

function SidebarGroupedList(props: {
  emptyLabel: string;
  groups: TeamMembersListGroup[];
  renderItem: (item: TeamMemberListItem) => ReactNode;
}) {
  const totalCount = props.groups.reduce(
    (sum, group) => sum + group.members.length,
    0
  );

  if (totalCount === 0) {
    return (
      <p className="pl-2 text-muted-foreground text-xs">{props.emptyLabel}</p>
    );
  }

  return (
    <SidebarNavList>
      {props.groups.map((group) => (
        <div className="contents" key={group.key}>
          {group.label ? (
            <SidebarNavSectionLabel>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{group.label}</span>
                <span className="shrink-0 text-muted-foreground text-xxs">
                  ({group.members.length})
                </span>
              </span>
            </SidebarNavSectionLabel>
          ) : null}
          {group.members.map((item) => props.renderItem(item))}
        </div>
      ))}
    </SidebarNavList>
  );
}

// ---------- Main panel ----------

export function TeamSidebarPanel() {
  const { t, i18n } = useTranslation("team");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const trimmed = search.trim();
  const isSearching = trimmed.length > 0;
  const { prefs, updatePrefs } = useTeamSidebarPrefs();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    void i18n.loadNamespaces(["team"]);
  }, [i18n]);

  // Filter options (roles, locations)
  const filterOptionsQuery = useQuery(teamFilterOptionsQueryOptions());
  const filterOptions = filterOptionsQuery.data ?? [];
  const roleOptions = useMemo(() => {
    const roleTax = filterOptions.find((fo) => fo.taxonomy.builtin === "role");
    return (roleTax?.terms ?? []).map((term) => ({
      id: term.id,
      label: term.label,
    }));
  }, [filterOptions]);
  const locationOptions = useMemo(() => {
    const locTax = filterOptions.find(
      (fo) => fo.taxonomy.builtin === "location"
    );
    return (locTax?.terms ?? []).map((term) => ({
      id: term.id,
      label: term.label,
    }));
  }, [filterOptions]);

  // Team members query
  const membersQuery = useTeamMembersListQuery({
    page: 1,
    pageSize: SIDEBAR_FETCH_SIZE,
    search: trimmed || undefined,
    sortBy: prefs.sortBy,
    sortOrder: prefs.sortOrder,
  });
  const members = membersQuery.data?.data ?? [];
  const isMembersLoading = membersQuery.isLoading && !membersQuery.data;

  // Agents query
  const {
    agents,
    catalogAvailable,
    isLoading: isAgentsLoading,
  } = useTeamAgentsCatalogQuery();

  // Grouping — derive term order for the active groupBy from filter options
  const groupTermOrder = useMemo(() => {
    if (prefs.groupBy === "role") {
      return roleOptions.map((o) => o.label);
    }
    if (prefs.groupBy === "location") {
      return locationOptions.map((o) => o.label);
    }
    return;
  }, [prefs.groupBy, roleOptions, locationOptions]);

  const groupedMembers = useMemo(
    () =>
      buildTeamMembersListGroups(
        members,
        prefs.groupBy,
        t("filters.ungrouped"),
        groupTermOrder
      ),
    [members, prefs.groupBy, t, groupTermOrder]
  );

  // Active entity detection
  const match = pathname.match(/^\/module\/team\/([a-f0-9-]+)/i);
  const activeMemberId = match ? match[1] : null;
  const isAgentsTab = pathname.startsWith(TEAM_AGENTS_PATH);
  // The route is the single source of truth for the active tab — deriving it
  // here (instead of a persisted pref reconciled by an effect) keeps the tab
  // and its content in sync with navigation in a single render, no flash.
  const activeTab: "team" | "agents" = isAgentsTab ? "agents" : "team";

  const handleCreateSuccess = useCallback(
    (_created: TeamMemberListItem) => {
      setCreateOpen(false);
      void membersQuery.refetch();
    },
    [membersQuery]
  );

  const handleTabChange = useCallback(
    (tab: "team" | "agents") => {
      navigate(tab === "agents" ? TEAM_AGENTS_PATH : TEAM_MODULE_BASE);
    },
    [navigate]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SidebarHeader className="gap-0 p-0 pb-3">
        {/* Search + filter + plus */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1",
            sidebarColumnContentInsetClassName,
            sidebarColumnContentInsetEndClassName
          )}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
            />
            <Input
              aria-label={t("sidebar.searchAria", {
                defaultValue: "Search team",
              })}
              className="h-8 w-full py-0 pr-7 pl-8 text-sm"
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("sidebar.searchPlaceholder", {
                defaultValue: "Search...",
              })}
              value={search}
              {...shellSecondaryNavItemProps}
            />
            {trimmed ? (
              <Button
                aria-label={t("sidebar.clearSearch", {
                  defaultValue: "Clear search",
                })}
                className="absolute top-1/2 right-1 h-6 w-6 shrink-0 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
                size="icon"
                tabIndex={-1}
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
          </div>
          {isSearching ? null : (
            <>
              {activeTab === "team" ? (
                <TeamSidebarListSettings
                  locationOptions={locationOptions}
                  prefs={prefs}
                  roleOptions={roleOptions}
                  updatePrefs={updatePrefs}
                />
              ) : null}
              <Button
                aria-label={t("addMember")}
                className="h-8 w-8 shrink-0 border-0 p-0 shadow-none"
                onClick={() => setCreateOpen(true)}
                title={t("addMember")}
                type="button"
                variant="ghost"
                {...shellSecondaryNavItemProps}
              >
                <Plus aria-hidden className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>

        {/* Tabs: Team | Agents */}
        {isSearching ? null : (
          <SidebarTabStrip
            onValueChange={(v) => handleTabChange(v as "team" | "agents")}
            value={activeTab}
          >
            <SidebarTab value="team">{t("sidebar.nav_team")}</SidebarTab>
            <SidebarTab value="agents">{t("sidebar.nav_agents")}</SidebarTab>
          </SidebarTabStrip>
        )}
      </SidebarHeader>

      {/* Content area */}
      <SidebarContent className="min-h-0 flex-1 gap-0.5 overflow-x-hidden px-0 py-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
          <SidebarGroup className="min-h-0 flex-1 p-0">
            <SidebarGroupContent>
              {activeTab === "team" ? (
                isMembersLoading ? (
                  <SidebarEntitySkeleton />
                ) : members.length === 0 ? (
                  <p className="py-2 pl-2 text-muted-foreground text-xs">
                    {isSearching
                      ? t("sidebar.noSearchResults", {
                          defaultValue: "No members match your search",
                        })
                      : t("sidebar.noMembers", {
                          defaultValue: "No team members yet",
                        })}
                  </p>
                ) : (
                  <SidebarGroupedList
                    emptyLabel={t("sidebar.noMembers", {
                      defaultValue: "No team members yet",
                    })}
                    groups={groupedMembers}
                    renderItem={(member) => (
                      <MemberSidebarRow
                        active={activeMemberId === member.id}
                        key={member.id}
                        member={member}
                      />
                    )}
                  />
                )
              ) : isAgentsLoading ? (
                <SidebarEntitySkeleton />
              ) : catalogAvailable ? (
                agents.length === 0 ? (
                  <p className="py-2 pl-2 text-muted-foreground text-xs">
                    {t("sidebar.noAgents", {
                      defaultValue: "No agents registered",
                    })}
                  </p>
                ) : (
                  <SidebarNavList>
                    {agents.map((agent) => (
                      <AgentSidebarRow
                        active={pathname === teamAgentDetailPath(agent.id)}
                        agent={agent}
                        key={agent.id}
                      />
                    ))}
                  </SidebarNavList>
                )
              ) : (
                <p className="py-2 pl-2 text-muted-foreground text-xs">
                  {t("agents.catalogUnavailable")}
                </p>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>

      {/* Footer: settings */}
      <div
        className={cn(
          "shrink-0 border-border/50 border-t pt-2 pb-2",
          sidebarColumnContentInsetClassName,
          sidebarColumnContentInsetEndClassName
        )}
      >
        <nav aria-label={t("sidebar.module_settings")}>
          <SidebarNavList>
            <SidebarNavRow
              active={pathname === TEAM_MODULE_SETTINGS_PATH}
              icon={Settings}
              label={t("sidebar.module_settings")}
              to={TEAM_MODULE_SETTINGS_PATH}
            />
          </SidebarNavList>
        </nav>
      </div>

      <TeamMemberCreateModal
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
        open={createOpen}
      />
    </div>
  );
}

// ---------- List settings popover (team tab only) ----------

interface TeamSidebarListSettingsProps {
  locationOptions: Array<{ id: string; label: string }>;
  prefs: TeamSidebarPrefs;
  roleOptions: Array<{ id: string; label: string }>;
  updatePrefs: (
    updater: (current: TeamSidebarPrefs) => TeamSidebarPrefs
  ) => void;
}

function TeamSidebarListSettings({
  prefs,
  updatePrefs,
  roleOptions,
  locationOptions,
}: TeamSidebarListSettingsProps) {
  const { t } = useTranslation("team");
  const selectContentClassName = "z-[110]";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("sidebar.listSettings", {
            defaultValue: "List settings",
          })}
          className="size-8 shrink-0 border-0 p-0 shadow-none"
          title={t("sidebar.listSettings", { defaultValue: "List settings" })}
          type="button"
          variant="ghost"
          {...shellSecondaryNavItemProps}
        >
          <ListFilter aria-hidden className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[100] w-[320px] overflow-hidden rounded-lg p-0"
      >
        {/* Group by */}
        <div className="space-y-1.5 p-2">
          <div className="font-medium text-muted-foreground text-xs">
            {t("filters.groupBy")}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <GroupModeButton
              icon={List}
              label={t("filters.groupByNone")}
              onClick={() =>
                updatePrefs((current) => ({
                  ...current,
                  groupBy: "none",
                }))
              }
              selected={prefs.groupBy === "none"}
            />
            <GroupModeButton
              icon={Building}
              label={t("filters.groupByDepartment")}
              onClick={() =>
                updatePrefs((current) => ({
                  ...current,
                  groupBy: "department",
                }))
              }
              selected={prefs.groupBy === "department"}
            />
            <GroupModeButton
              icon={User}
              label={t("filters.groupByRole")}
              onClick={() =>
                updatePrefs((current) => ({
                  ...current,
                  groupBy: "role",
                }))
              }
              selected={prefs.groupBy === "role"}
            />
            <GroupModeButton
              icon={MapPin}
              label={t("filters.groupByLocation")}
              onClick={() =>
                updatePrefs((current) => ({
                  ...current,
                  groupBy: "location",
                }))
              }
              selected={prefs.groupBy === "location"}
            />
          </div>
        </div>
        <Separator />
        {/* Sort */}
        <div className="space-y-2 px-2 py-2">
          <div className="space-y-1.5">
            <div className="font-medium text-muted-foreground text-xs">
              {t("sortBy")}
            </div>
            <div className="flex items-center gap-2">
              <Select
                onValueChange={(value) =>
                  updatePrefs((current) => ({
                    ...current,
                    sortBy: value as TeamSidebarPrefs["sortBy"],
                  }))
                }
                value={prefs.sortBy}
              >
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue>
                    {prefs.sortBy === "position"
                      ? t("sortByPosition")
                      : prefs.sortBy === "department"
                        ? t("sortByDepartment")
                        : prefs.sortBy === "created_at"
                          ? t("sortByCreatedAt")
                          : t("sortByName")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={selectContentClassName}>
                  <SelectItem value="full_name">{t("sortByName")}</SelectItem>
                  <SelectItem value="position">
                    {t("sortByPosition")}
                  </SelectItem>
                  <SelectItem value="department">
                    {t("sortByDepartment")}
                  </SelectItem>
                  <SelectItem value="created_at">
                    {t("sortByCreatedAt")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                aria-label={t("sidebar.sortOrderAria", {
                  defaultValue: "Sort order",
                })}
                className="h-8 w-8 shrink-0 p-0"
                onClick={() =>
                  updatePrefs((current) => ({
                    ...current,
                    sortOrder: current.sortOrder === "asc" ? "desc" : "asc",
                  }))
                }
                type="button"
                variant="outline"
              >
                {prefs.sortOrder === "asc" ? (
                  <ArrowUpWideNarrow className="size-3.5" />
                ) : (
                  <ArrowDownWideNarrow className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- Compact reusable UI ----------

function GroupModeButton(props: {
  className?: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  const Icon = props.icon;
  return (
    <Button
      className={cn(
        "h-auto min-h-16 flex-col items-center gap-1 rounded-md py-2 text-xxs hover:bg-card",
        props.selected ? "bg-card/90 shadow-sm" : "text-muted-foreground",
        props.className
      )}
      onClick={props.onClick}
      type="button"
      variant="ghost"
    >
      <Icon className="size-4" />
      <span className="max-w-full truncate">{props.label}</span>
    </Button>
  );
}
