/**
 * Actions panel for AgentsWorkspaceSidebar — actions tab content.
 * Owns its own search, sort, group and filter state.
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
  List,
  ListChecks,
  ListFilter,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AiRegisteredAction } from "../../lib/admin/ai-runtime-api";
import { catalogQueryMatches } from "./workspace-nav-utils";

type ActionGroupBy = "none" | "module" | "source";
type ActionSourceFilter = "all" | "core" | "module" | "tenant";
type ActionSortOrder = "asc" | "desc";

interface ActionGroup {
  actions: AiRegisteredAction[];
  id: string;
  label: string | null;
}

interface AgentsWorkspaceActionsPanelProps {
  actions: AiRegisteredAction[];
  actionsLoading: boolean;
  onSelectAction: (id: string) => void;
  selectedActionId: string;
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

export function AgentsWorkspaceActionsPanel({
  actions,
  actionsLoading,
  onSelectAction,
  selectedActionId,
}: AgentsWorkspaceActionsPanelProps) {
  const { t } = useTranslation("ai-ui");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<ActionGroupBy>("none");
  const [sourceFilter, setSourceFilter] = useState<ActionSourceFilter>("all");
  const [sortOrder, setSortOrder] = useState<ActionSortOrder>("asc");

  const searchLower = search.trim().toLowerCase();
  const searchActive = searchLower.length > 0;

  const filtered = useMemo(
    () =>
      actions
        .filter(
          (a) =>
            (sourceFilter === "all" ||
              (a.owner_kind ?? "tenant") === sourceFilter) &&
            (!searchActive || catalogQueryMatches(a.name, searchLower))
        )
        .sort((a, b) => {
          const cmp = a.name.localeCompare(b.name);
          return sortOrder === "asc" ? cmp : -cmp;
        }),
    [actions, sourceFilter, searchActive, searchLower, sortOrder]
  );

  const groups = useMemo((): ActionGroup[] => {
    if (groupBy === "none") {
      return [{ id: "all", label: null, actions: filtered }];
    }
    const map = new Map<string, AiRegisteredAction[]>();
    for (const a of filtered) {
      const key =
        groupBy === "module"
          ? (a.module_id ?? t("workspace.sidebarGroupOther"))
          : (a.owner_kind ?? "tenant");
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(a);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({
        id: key,
        label: key,
        actions: items,
      }));
  }, [filtered, groupBy, t]);

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
        onPointerDownOutside={(e) => {
          if (
            e.target instanceof Element &&
            e.target.closest('[data-slot="select-content"]')
          ) {
            e.preventDefault();
          }
        }}
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
              onValueChange={(v) => setSortOrder(v as ActionSortOrder)}
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
              onValueChange={(v) => setSourceFilter(v as ActionSourceFilter)}
              value={sourceFilter}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[110]">
                <SelectItem value="all">
                  {t("skillsCatalog.originAll")}
                </SelectItem>
                <SelectItem value="core">{t("skills.origin.core")}</SelectItem>
                <SelectItem value="module">
                  {t("skills.origin.module")}
                </SelectItem>
                <SelectItem value="tenant">
                  {t("skills.origin.tenant")}
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
            {groups.every((g) => g.actions.length === 0) ? (
              <p
                className={cn(
                  "py-1 text-muted-foreground text-xs",
                  sidebarColumnContentInsetClassName
                )}
              >
                {actionsLoading
                  ? t("actionsCatalog.loading")
                  : t("actionsCatalog.empty")}
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
                    {group.actions.map((action) => (
                      <SidebarMenuItem key={action.id}>
                        <SidebarMenuButton
                          isActive={action.id === selectedActionId}
                          onClick={() => onSelectAction(action.id)}
                        >
                          <ListChecks aria-hidden className="size-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">
                            {action.name}
                          </span>
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
