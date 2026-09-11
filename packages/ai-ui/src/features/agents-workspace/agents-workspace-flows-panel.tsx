/**
 * Flows panel for AgentsWorkspaceSidebar — the flows tab content.
 *
 * One list of everything runnable: flows drawn in the canvas and Actions
 * shipped as module workflows. Owns its own search, sort, group
 * and filter state.
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
  Boxes,
  CircleDot,
  FileTerminal,
  List,
  ListFilter,
  Search,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  flowEntryStatus,
  type WorkflowCatalogEntry,
} from "../workflow-canvas/workflow-flows-state.js";
import { useAdminAgentsSidebarNavPersistence } from "./admin-agents-sidebar-nav-queries.js";
import type {
  FlowGroupBy,
  FlowOriginFilter,
} from "./admin-agents-sidebar-nav-state.js";
import { isFlowEntrySelected } from "./use-flow-catalog.js";
import { catalogQueryMatches } from "./workspace-nav-utils";

interface FlowGroup {
  flows: WorkflowCatalogEntry[];
  id: string;
  label: string | null;
}

interface AgentsWorkspaceFlowsPanelProps {
  flows: WorkflowCatalogEntry[];
  flowsLoading: boolean;
  onSelectFlow: (flow: WorkflowCatalogEntry) => void;
  selectedFlowId: string;
}

function GroupButton({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      className={cn(
        "h-auto min-h-14 flex-col items-center gap-1 rounded-md py-2 text-xs hover:bg-card",
        selected ? "bg-card/90 shadow-sm" : "text-muted-foreground"
      )}
      onClick={onClick}
      type="button"
      variant="ghost"
    >
      <Icon className="size-4" />
      <span className="max-w-full truncate">{label}</span>
    </Button>
  );
}

export function AgentsWorkspaceFlowsPanel({
  flows,
  flowsLoading,
  onSelectFlow,
  selectedFlowId,
}: AgentsWorkspaceFlowsPanelProps) {
  const { t } = useTranslation("ai-ui");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  // Group / filter / sort ride in the user's sidebar settings; the search box
  // stays local, so a reload never hides the catalog behind a stale query.
  const { catalogFilters, setCatalogFilters } =
    useAdminAgentsSidebarNavPersistence();
  const { groupBy, source: sourceFilter, sortOrder } = catalogFilters.flows;
  const setGroupBy = (value: FlowGroupBy) =>
    setCatalogFilters("flows", { groupBy: value });
  const setSourceFilter = (value: FlowOriginFilter) =>
    setCatalogFilters("flows", { source: value });
  const setSortOrder = (value: "asc" | "desc") =>
    setCatalogFilters("flows", { sortOrder: value });

  const searchLower = search.trim().toLowerCase();
  const searchActive = searchLower.length > 0;

  const filtered = useMemo(
    () =>
      flows
        .filter(
          (flow) =>
            (sourceFilter === "all" || flow.source === sourceFilter) &&
            (!searchActive || catalogQueryMatches(flow.name, searchLower))
        )
        .sort((a, b) => {
          const cmp = a.name.localeCompare(b.name);
          return sortOrder === "asc" ? cmp : -cmp;
        }),
    [flows, sourceFilter, searchActive, searchLower, sortOrder]
  );

  const groups = useMemo((): FlowGroup[] => {
    if (groupBy === "none") {
      return [{ id: "all", label: null, flows: filtered }];
    }
    const map = new Map<string, WorkflowCatalogEntry[]>();
    for (const flow of filtered) {
      const key =
        groupBy === "module"
          ? (flow.moduleId ?? t("workspace.sidebarGroupOther"))
          : t(`workflows.source.${flow.source}`);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(flow);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({
        id: key,
        label: key,
        flows: items,
      }));
  }, [filtered, groupBy, t]);

  const filterPopover = (
    <Popover
      onOpenChange={(open, eventDetails) => {
        if (
          !open &&
          eventDetails.reason === "outside-press" &&
          eventDetails.event.target instanceof Element &&
          eventDetails.event.target.closest('[data-slot="select-content"]')
        ) {
          eventDetails.cancel();
          return;
        }
        setFilterOpen(open);
      }}
      open={filterOpen}
    >
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
        <div className="space-y-1.5 p-3">
          <div className="font-medium text-muted-foreground text-xs">
            {t("workspace.sidebarGroupBy")}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <GroupButton
              icon={List}
              label={t("workspace.sidebarGroupByNone")}
              onClick={() => setGroupBy("none")}
              selected={groupBy === "none"}
            />
            <GroupButton
              icon={Boxes}
              label={t("workspace.sidebarGroupByModule")}
              onClick={() => setGroupBy("module")}
              selected={groupBy === "module"}
            />
            <GroupButton
              icon={CircleDot}
              label={t("workspace.sidebarGroupBySource")}
              onClick={() => setGroupBy("source")}
              selected={groupBy === "source"}
            />
          </div>
        </div>
        <Separator />
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
              onValueChange={(v) => setSortOrder(v as "asc" | "desc")}
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
              {t("skillsCatalog.origin")}
            </div>
            <Select
              onValueChange={(v) => setSourceFilter(v as FlowOriginFilter)}
              value={sourceFilter}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[110]">
                <SelectItem value="all">
                  {t("skillsCatalog.originAll")}
                </SelectItem>
                <SelectItem value="module">
                  {t("workflows.source.module")}
                </SelectItem>
                <SelectItem value="authored">
                  {t("workflows.source.authored")}
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
            {groups.every((g) => g.flows.length === 0) ? (
              <p
                className={cn(
                  "py-1 text-muted-foreground text-xs",
                  sidebarColumnContentInsetClassName
                )}
              >
                {flowsLoading ? t("workflows.loading") : t("workflows.empty")}
              </p>
            ) : (
              <SidebarNavList>
                {groups.map((group) => (
                  <div className="contents" key={group.id}>
                    {group.label ? (
                      <SidebarNavSectionLabel>
                        {group.label}
                      </SidebarNavSectionLabel>
                    ) : null}
                    {group.flows.map((flow) => (
                      <SidebarMenuItem key={flow.id}>
                        <SidebarMenuButton
                          isActive={isFlowEntrySelected(flow, selectedFlowId)}
                          onClick={() => onSelectFlow(flow)}
                        >
                          {flow.source === "module" ? (
                            <FileTerminal
                              aria-hidden
                              className="size-4 shrink-0"
                            />
                          ) : (
                            <Workflow aria-hidden className="size-4 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {flow.name}
                          </span>
                          {flowEntryStatus(flow) === "active" ? null : (
                            <span className="shrink-0 text-[10px] text-muted-foreground uppercase">
                              {t(`workflows.status.${flowEntryStatus(flow)}`)}
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </div>
                ))}
              </SidebarNavList>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
