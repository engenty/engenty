import { shellSecondaryNavItemProps } from "@engenty/app-shell";
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
  type LucideIcon,
  Search,
  Tag,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type {
  NormalizedSkillRecord,
  SkillCatalogGroup,
  SkillCatalogGroupBy,
  SkillCatalogOriginFilter,
  SkillCatalogSortBy,
  SkillCatalogTierFilter,
} from "./skills-catalog-state";

function displayName(skill: Pick<NormalizedSkillRecord, "name" | "title">) {
  return skill.title?.trim() || skill.name;
}

export interface SkillCatalogSidebarLabels {
  empty: string;
  filterToggle: string;
  groupBy: string;
  groupByModule: string;
  groupByNone: string;
  groupBySource: string;
  groupByTier: string;
  module: string;
  origin: string;
  originAll: string;
  originCore: string;
  originModule: string;
  originTenant: string;
  searchPlaceholder: string;
  sortAscending: string;
  sortBy: string;
  sortByModule: string;
  sortByName: string;
  sortByUpdated: string;
  sortDescending: string;
  tier: string;
  tierAll: string;
  tierCustom: string;
  tierManaged: string;
}

/** Shared label wiring for the skills catalog sidebar (list + detail pages). */
export function buildSkillCatalogSidebarLabels(
  t: (key: string) => string,
  emptyLabel: string
): SkillCatalogSidebarLabels {
  return {
    empty: emptyLabel,
    filterToggle: t("skillsCatalog.filterToggle"),
    groupBy: t("skillsCatalog.groupBy"),
    groupByModule: t("skillsCatalog.groupByModule"),
    groupByNone: t("skillsCatalog.groupByNone"),
    groupBySource: t("skillsCatalog.groupBySource"),
    groupByTier: t("skillsCatalog.groupByTier"),
    module: t("skillsCatalog.module"),
    origin: t("skillsCatalog.origin"),
    originAll: t("skillsCatalog.originAll"),
    originCore: t("skills.origin.core"),
    originModule: t("skills.origin.module"),
    originTenant: t("skills.origin.tenant"),
    searchPlaceholder: t("skillsCatalog.searchPlaceholder"),
    sortAscending: t("skillsCatalog.sortAscending"),
    sortBy: t("skillsCatalog.sortBy"),
    sortByModule: t("skillsCatalog.sortByModule"),
    sortByName: t("skillsCatalog.sortByName"),
    sortByUpdated: t("skillsCatalog.sortByUpdated"),
    sortDescending: t("skillsCatalog.sortDescending"),
    tier: t("skillsCatalog.tier"),
    tierAll: t("skillsCatalog.tierAll"),
    tierCustom: t("skillsCatalog.tierCustom"),
    tierManaged: t("skillsCatalog.tierManaged"),
  };
}

export function SkillCatalogSidebar({
  groups,
  groupBy,
  hideSearch = false,
  labels,
  moduleFilter,
  moduleOptions,
  onGroupByChange,
  onModuleFilterChange,
  onOriginFilterChange,
  onSearchChange,
  onSelectSkill,
  onSortByChange,
  onSortOrderChange,
  onTierFilterChange,
  originFilter,
  searchQuery,
  selectedSkillId,
  sortBy,
  sortOrder,
  tierFilter,
}: {
  groups: SkillCatalogGroup[];
  groupBy: SkillCatalogGroupBy;
  hideSearch?: boolean;
  labels: SkillCatalogSidebarLabels;
  moduleFilter: string;
  moduleOptions: { label: string; value: string }[];
  onGroupByChange: (value: SkillCatalogGroupBy) => void;
  onModuleFilterChange: (value: string) => void;
  onOriginFilterChange: (value: SkillCatalogOriginFilter) => void;
  onSearchChange: (value: string) => void;
  onSelectSkill: (skillName: string) => void;
  onSortByChange: (value: SkillCatalogSortBy) => void;
  onSortOrderChange: (value: "asc" | "desc") => void;
  onTierFilterChange: (value: SkillCatalogTierFilter) => void;
  originFilter: SkillCatalogOriginFilter;
  searchQuery: string;
  selectedSkillId: string;
  sortBy: SkillCatalogSortBy;
  sortOrder: "asc" | "desc";
  tierFilter: SkillCatalogTierFilter;
}) {
  const selectContentClassName = "z-[110]";
  const [filterOpen, setFilterOpen] = useState(false);

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
          aria-label={labels.filterToggle}
          className="size-8 shrink-0 border-0 p-0 shadow-none"
          title={labels.filterToggle}
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
        <div className="space-y-1.5 p-2">
          <div className="font-medium text-muted-foreground text-xs">
            {labels.groupBy}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <GroupModeButton
              icon={List}
              label={labels.groupByNone}
              onClick={() => onGroupByChange("none")}
              selected={groupBy === "none"}
            />
            <GroupModeButton
              icon={Boxes}
              label={labels.groupByModule}
              onClick={() => onGroupByChange("module")}
              selected={groupBy === "module"}
            />
            <GroupModeButton
              icon={CircleDot}
              label={labels.groupBySource}
              onClick={() => onGroupByChange("source")}
              selected={groupBy === "source"}
            />
            <GroupModeButton
              icon={Tag}
              label={labels.groupByTier}
              onClick={() => onGroupByChange("tier")}
              selected={groupBy === "tier"}
            />
          </div>
        </div>
        <Separator />
        <div className="space-y-2 px-2 py-2">
          <div className="space-y-1.5">
            <div className="font-medium text-muted-foreground text-xs">
              {labels.sortBy}
            </div>
            <div className="flex items-center gap-2">
              <Select
                onValueChange={(value) =>
                  onSortByChange(value as SkillCatalogSortBy)
                }
                value={sortBy}
              >
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentClassName}>
                  <SelectItem value="name">{labels.sortByName}</SelectItem>
                  <SelectItem value="module">{labels.sortByModule}</SelectItem>
                  <SelectItem value="updated_at">
                    {labels.sortByUpdated}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Tabs
                className="shrink-0"
                onValueChange={(value) =>
                  onSortOrderChange(value as "asc" | "desc")
                }
                value={sortOrder}
              >
                <TabsList className="h-8 p-0.5">
                  <TabsTrigger
                    aria-label={labels.sortAscending}
                    className="h-7 w-8 p-0"
                    title={labels.sortAscending}
                    value="asc"
                  >
                    <ArrowUpWideNarrow className="size-3.5" />
                  </TabsTrigger>
                  <TabsTrigger
                    aria-label={labels.sortDescending}
                    className="h-7 w-8 p-0"
                    title={labels.sortDescending}
                    value="desc"
                  >
                    <ArrowDownWideNarrow className="size-3.5" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
        <Separator />
        <div className="space-y-2 p-2">
          <CompactFilterSelect
            label={labels.origin}
            onValueChange={(value) =>
              onOriginFilterChange(value as SkillCatalogOriginFilter)
            }
            value={originFilter}
          >
            <SelectContent className={selectContentClassName}>
              <SelectItem value="all">{labels.originAll}</SelectItem>
              <SelectItem value="core">{labels.originCore}</SelectItem>
              <SelectItem value="module">{labels.originModule}</SelectItem>
              <SelectItem value="tenant">{labels.originTenant}</SelectItem>
            </SelectContent>
          </CompactFilterSelect>
          <CompactFilterSelect
            label={labels.tier}
            onValueChange={(value) =>
              onTierFilterChange(value as SkillCatalogTierFilter)
            }
            value={tierFilter}
          >
            <SelectContent className={selectContentClassName}>
              <SelectItem value="all">{labels.tierAll}</SelectItem>
              <SelectItem value="managed">{labels.tierManaged}</SelectItem>
              <SelectItem value="custom">{labels.tierCustom}</SelectItem>
            </SelectContent>
          </CompactFilterSelect>
          <CompactFilterSelect
            label={labels.module}
            onValueChange={onModuleFilterChange}
            value={moduleFilter}
          >
            <SelectContent className={selectContentClassName}>
              {moduleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </CompactFilterSelect>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col">
      <SidebarHeader className="gap-0 p-0 pt-2 pb-2">
        {hideSearch ? (
          <div
            className={cn(
              "flex min-w-0 items-center justify-end",
              sidebarColumnContentInsetClassName,
              sidebarColumnContentInsetEndClassName
            )}
          >
            {filterPopover}
          </div>
        ) : (
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
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={labels.searchPlaceholder}
                className="h-8 w-full py-0 pr-3 pl-7 text-xs"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={labels.searchPlaceholder}
                value={searchQuery}
                {...shellSecondaryNavItemProps}
              />
            </div>
            {filterPopover}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-0 py-0">
        <SidebarGroup className="p-0 pb-2">
          <SidebarGroupContent>
            {groups.length === 0 ? (
              <p className="pl-2 text-muted-foreground text-xs leading-relaxed">
                {labels.empty}
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
                    {group.skills.map((skill) => (
                      <SkillCatalogSidebarRow
                        key={skill.name}
                        onSelect={onSelectSkill}
                        selected={selectedSkillId === skill.name}
                        skill={skill}
                      />
                    ))}
                  </div>
                ))}
              </SidebarNavList>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </aside>
  );
}

function SkillCatalogSidebarRow({
  onSelect,
  selected,
  skill,
}: {
  onSelect: (skillName: string) => void;
  selected: boolean;
  skill: NormalizedSkillRecord;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={selected}
        onClick={() => onSelect(skill.name)}
        title={skill.name}
        type="button"
        {...shellSecondaryNavItemProps}
      >
        <FileTerminal aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{displayName(skill)}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function GroupModeButton(props: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  const Icon = props.icon;
  return (
    <Button
      className={cn(
        "h-auto min-h-16 flex-col items-center gap-1 rounded-md py-2 text-xs hover:bg-card",
        props.selected ? "bg-card/90 shadow-sm" : "text-muted-foreground"
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

function CompactFilterSelect(props: {
  children: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <div className="truncate font-medium text-muted-foreground text-xs">
        {props.label}
      </div>
      <Select onValueChange={props.onValueChange} value={props.value}>
        <SelectTrigger className="h-8 w-[11.25rem] justify-self-end text-xs">
          <SelectValue />
        </SelectTrigger>
        {props.children}
      </Select>
    </div>
  );
}
