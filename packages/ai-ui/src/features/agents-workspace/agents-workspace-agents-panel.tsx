/**
 * Agents panel for AgentsWorkspaceSidebar — agents tab content.
 * Owns its own search, sort and filter state.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarNavList,
  SidebarNavSectionLabel,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Bot,
  Cpu,
  ListFilter,
  Pin,
  PinOff,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AiAgentEntry } from "../../lib/admin/ai-runtime-api";
import { catalogQueryMatches } from "./workspace-nav-utils";

type AgentKindFilter = "all" | "system" | "agent";
type AgentSortOrder = "asc" | "desc";

interface AgentsWorkspaceAgentsPanelProps {
  agents: AiAgentEntry[];
  isLandingPage: boolean;
  onSelectAgent: (id: string) => void;
  pinAgent: (id: string) => void;
  pinnedAgents: string[];
  runNav: (fn: () => void) => void;
  selectedAgentId: string;
  unpinAgent: (id: string) => void;
}

function AgentIcon({ kind }: { kind: AiAgentEntry["kind"] }) {
  const Icon = kind === "system" ? Cpu : Bot;
  return <Icon aria-hidden className="size-4 shrink-0" />;
}

export function AgentsWorkspaceAgentsPanel({
  agents,
  isLandingPage,
  onSelectAgent,
  pinAgent,
  pinnedAgents,
  runNav,
  selectedAgentId,
  unpinAgent,
}: AgentsWorkspaceAgentsPanelProps) {
  const { t } = useTranslation("ai-ui");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<AgentKindFilter>("all");
  const [sortOrder, setSortOrder] = useState<AgentSortOrder>("asc");

  const searchLower = search.trim().toLowerCase();
  const searchActive = searchLower.length > 0;
  const pinnedSet = useMemo(() => new Set(pinnedAgents), [pinnedAgents]);

  const matchesFilters = (a: AiAgentEntry) =>
    (kindFilter === "all" || a.kind === kindFilter) &&
    (!searchActive || catalogQueryMatches(a.name, searchLower));

  const sortFn = (a: AiAgentEntry, b: AiAgentEntry) => {
    const cmp = a.name.localeCompare(b.name);
    return sortOrder === "asc" ? cmp : -cmp;
  };

  const pinnedVisible = useMemo(
    () =>
      agents
        .filter((a) => pinnedSet.has(a.id) && matchesFilters(a))
        .sort(sortFn),
    [agents, pinnedSet, kindFilter, searchActive, searchLower, sortOrder]
  );
  const unpinnedFiltered = useMemo(
    () =>
      agents
        .filter((a) => !pinnedSet.has(a.id) && matchesFilters(a))
        .sort(sortFn),
    [agents, pinnedSet, kindFilter, searchActive, searchLower, sortOrder]
  );

  const filterPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("workspace.sidebarFilterToggle")}
          className="size-8 shrink-0 border-0 p-0 shadow-none"
          type="button"
          variant="ghost"
          {...shellSecondaryNavItemProps}
        >
          <ListFilter aria-hidden className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[100] w-[280px] overflow-hidden rounded-lg p-0"
      >
        <div className="space-y-2 p-3">
          <div className="font-medium text-muted-foreground text-xs">
            {t("workspace.sidebarSortBy")}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs">
              {t("workspace.sidebarSortName")}
            </span>
            <Tabs
              className="shrink-0"
              onValueChange={(v) => setSortOrder(v as AgentSortOrder)}
              value={sortOrder}
            >
              <TabsList className="h-8 p-0.5">
                <TabsTrigger
                  aria-label={t("skillsCatalog.sortAscending")}
                  className="h-7 w-8 p-0"
                  title={t("skillsCatalog.sortAscending")}
                  value="asc"
                >
                  <ArrowUpWideNarrow className="size-3.5" />
                </TabsTrigger>
                <TabsTrigger
                  aria-label={t("skillsCatalog.sortDescending")}
                  className="h-7 w-8 p-0"
                  title={t("skillsCatalog.sortDescending")}
                  value="desc"
                >
                  <ArrowDownWideNarrow className="size-3.5" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <Separator />
        <div className="space-y-2 p-3">
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
            <div className="truncate font-medium text-muted-foreground text-xs">
              {t("workspace.sidebarFilterKind")}
            </div>
            <Select
              onValueChange={(v) => setKindFilter(v as AgentKindFilter)}
              value={kindFilter}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[110]">
                <SelectItem value="all">
                  {t("workspace.sidebarFilterKindAll")}
                </SelectItem>
                <SelectItem value="system">
                  {t("workspace.sidebarFilterKindSystem")}
                </SelectItem>
                <SelectItem value="agent">
                  {t("workspace.sidebarFilterKindAgent")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 py-2",
          sidebarColumnContentInsetClassName,
          sidebarColumnContentInsetEndClassName
        )}
      >
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t("workspace.sidebarCatalogSearchAria")}
            className="h-8 w-full py-0 pr-3 pl-7 text-xs"
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("workspace.sidebarCatalogSearchPlaceholder")}
            type="search"
            value={search}
            {...shellSecondaryNavItemProps}
          />
        </div>
        {filterPopover}
      </div>

      <SidebarContent className="px-0 py-0">
        <SidebarGroup className="p-0 pb-2">
          <SidebarGroupContent>
            {pinnedVisible.length > 0 ? (
              <>
                <SidebarNavSectionLabel>
                  {t("workspace.sidebarPinned")}
                </SidebarNavSectionLabel>
                <SidebarNavList>
                  {pinnedVisible.map((agent) => (
                    <SidebarMenuItem
                      className="group/menu-item flex items-center gap-0.5"
                      key={agent.id}
                    >
                      <SidebarMenuButton
                        className="min-w-0 flex-1"
                        isActive={
                          !isLandingPage && agent.id === selectedAgentId
                        }
                        onClick={() => runNav(() => onSelectAgent(agent.id))}
                      >
                        <AgentIcon kind={agent.kind} />
                        <span className="min-w-0 flex-1 truncate">
                          {agent.name}
                        </span>
                      </SidebarMenuButton>
                      <Button
                        aria-label={t("workspace.sidebarUnpinAgentAria")}
                        className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          unpinAgent(agent.id);
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <PinOff aria-hidden className="size-3.5" />
                      </Button>
                    </SidebarMenuItem>
                  ))}
                </SidebarNavList>
              </>
            ) : null}

            <SidebarNavSectionLabel>
              {t("workspace.sidebarAgents")}
            </SidebarNavSectionLabel>
            <SidebarNavList>
              {unpinnedFiltered.map((agent) => (
                <SidebarMenuItem
                  className="group/menu-item flex items-center gap-0.5"
                  key={agent.id}
                >
                  <SidebarMenuButton
                    className="min-w-0 flex-1"
                    isActive={!isLandingPage && agent.id === selectedAgentId}
                    onClick={() => runNav(() => onSelectAgent(agent.id))}
                  >
                    <AgentIcon kind={agent.kind} />
                    <span className="min-w-0 flex-1 truncate">
                      {agent.name}
                    </span>
                  </SidebarMenuButton>
                  <Button
                    aria-label={t("workspace.sidebarPinAgentAria")}
                    className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      pinAgent(agent.id);
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Pin aria-hidden className="size-3.5" />
                  </Button>
                </SidebarMenuItem>
              ))}
              {agents.length === 0 ? (
                <p
                  className={cn(
                    "py-1 text-muted-foreground text-xs",
                    sidebarColumnContentInsetClassName
                  )}
                >
                  {t("agents.empty")}
                </p>
              ) : null}
            </SidebarNavList>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
