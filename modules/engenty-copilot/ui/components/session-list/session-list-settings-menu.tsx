import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import {
  Archive,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Bot,
  CalendarDays,
  CircleDot,
  Layers2,
  ListFilter,
  type LucideIcon,
  MessageSquareText,
  Tags,
} from "lucide-react";
import type { ReactNode } from "react";
import { useSessionList } from "./session-list-context.js";
import type {
  SessionListAgeFilter,
  SessionListArchivedFilter,
  SessionListSortBy,
} from "./session-list-organization.js";

export function SessionListSettingsMenu() {
  const list = useSessionList();
  const selectContentClassName = "z-[110]";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={list.labels.listSettings}
          className="size-8 shrink-0 border-0 p-0 shadow-none"
          disabled={!list.isTransportReady}
          title={list.labels.listSettings}
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
        onPointerDownOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest('[data-slot="select-content"]')
          ) {
            event.preventDefault();
          }
        }}
      >
        <div className="space-y-1.5 p-2">
          <div className="font-medium text-muted-foreground text-xs">
            {list.labels.groupBy}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <GroupModeButton
              icon={MessageSquareText}
              label={list.labels.groupNoneShort}
              onClick={() =>
                list.onPrefsChange((prefs) => ({ ...prefs, groupBy: "none" }))
              }
              selected={list.prefs.groupBy === "none"}
            />
            <GroupModeButton
              icon={CalendarDays}
              label={list.labels.groupDate}
              onClick={() =>
                list.onPrefsChange((prefs) => ({ ...prefs, groupBy: "date" }))
              }
              selected={list.prefs.groupBy === "date"}
            />
            <GroupModeButton
              icon={CircleDot}
              label={list.labels.groupStatus}
              onClick={() =>
                list.onPrefsChange((prefs) => ({
                  ...prefs,
                  groupBy: "status",
                }))
              }
              selected={list.prefs.groupBy === "status"}
            />
            <GroupModeButton
              icon={Bot}
              label={list.labels.groupAgent}
              onClick={() =>
                list.onPrefsChange((prefs) => ({ ...prefs, groupBy: "agent" }))
              }
              selected={list.prefs.groupBy === "agent"}
            />
            <GroupModeButton
              icon={Tags}
              label={list.labels.groupType}
              onClick={() =>
                list.onPrefsChange((prefs) => ({ ...prefs, groupBy: "type" }))
              }
              selected={list.prefs.groupBy === "type"}
            />
          </div>
        </div>
        <Separator />
        <div className="space-y-2 px-2 py-2">
          <div className="space-y-1.5">
            <div className="font-medium text-muted-foreground text-xs">
              {list.labels.sortBy}
            </div>
            <div className="flex items-center gap-2">
              <Select
                onValueChange={(value) =>
                  list.onPrefsChange((prefs) => ({
                    ...prefs,
                    sortBy: value as SessionListSortBy,
                  }))
                }
                value={list.prefs.sortBy}
              >
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue>
                    {list.prefs.sortBy === "created_at"
                      ? list.labels.sortCreated
                      : list.prefs.sortBy === "title"
                        ? list.labels.sortTitle
                        : list.prefs.sortBy === "agent"
                          ? list.labels.sortAgent
                          : list.labels.sortUpdated}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={selectContentClassName}>
                  <SelectItem value="updated_at">
                    {list.labels.sortUpdated}
                  </SelectItem>
                  <SelectItem value="created_at">
                    {list.labels.sortCreated}
                  </SelectItem>
                  <SelectItem value="title">{list.labels.sortTitle}</SelectItem>
                  <SelectItem value="agent">{list.labels.sortAgent}</SelectItem>
                </SelectContent>
              </Select>
              <Tabs
                className="shrink-0"
                onValueChange={(value) =>
                  list.onPrefsChange((prefs) => ({
                    ...prefs,
                    sortOrder: value as "asc" | "desc",
                  }))
                }
                value={list.prefs.sortOrder}
              >
                <TabsList className="h-8 p-0.5">
                  <TabsTrigger
                    aria-label={list.labels.sortAscending}
                    className="h-7 w-8 p-0"
                    title={list.labels.sortAscending}
                    value="asc"
                  >
                    <ArrowUpWideNarrow className="size-3.5" />
                  </TabsTrigger>
                  <TabsTrigger
                    aria-label={list.labels.sortDescending}
                    className="h-7 w-8 p-0"
                    title={list.labels.sortDescending}
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
            label={list.labels.agent}
            onValueChange={(value) =>
              list.onPrefsChange((prefs) => ({
                ...prefs,
                agentId: value === "all" ? null : value,
              }))
            }
            selectedLabel={
              list.prefs.agentId
                ? (list.agentOptions.find((a) => a.id === list.prefs.agentId)
                    ?.name ?? list.prefs.agentId)
                : list.labels.allAgents
            }
            value={list.prefs.agentId ?? "all"}
          >
            <SelectContent className={selectContentClassName}>
              <SelectItem value="all">{list.labels.allAgents}</SelectItem>
              {list.agentOptions.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </CompactFilterSelect>
          <CompactFilterSelect
            label={list.labels.status}
            onValueChange={(value) =>
              list.onPrefsChange((prefs) => ({
                ...prefs,
                status: value as typeof prefs.status,
              }))
            }
            selectedLabel={
              list.prefs.status === "all"
                ? list.labels.allStatuses
                : (list.statusOptions.find((s) => s.value === list.prefs.status)
                    ?.label ?? list.prefs.status)
            }
            value={list.prefs.status}
          >
            <SelectContent className={selectContentClassName}>
              <SelectItem value="all">{list.labels.allStatuses}</SelectItem>
              {list.statusOptions.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </CompactFilterSelect>
          <CompactFilterSelect
            label={list.labels.age}
            onValueChange={(value) =>
              list.onPrefsChange((prefs) => ({
                ...prefs,
                age: value as SessionListAgeFilter,
              }))
            }
            selectedLabel={
              list.prefs.age === "today"
                ? list.labels.dateToday
                : list.prefs.age === "last-two-days"
                  ? list.labels.ageLastTwoDays
                  : list.prefs.age === "last-seven-days"
                    ? list.labels.ageLastSevenDays
                    : list.prefs.age === "last-thirty-days"
                      ? list.labels.ageLastThirtyDays
                      : list.labels.ageAll
            }
            value={list.prefs.age}
          >
            <SelectContent className={selectContentClassName}>
              <SelectItem value="all">{list.labels.ageAll}</SelectItem>
              <SelectItem value="today">{list.labels.dateToday}</SelectItem>
              <SelectItem value="last-two-days">
                {list.labels.ageLastTwoDays}
              </SelectItem>
              <SelectItem value="last-seven-days">
                {list.labels.ageLastSevenDays}
              </SelectItem>
              <SelectItem value="last-thirty-days">
                {list.labels.ageLastThirtyDays}
              </SelectItem>
            </SelectContent>
          </CompactFilterSelect>
          <VisibilityFilter
            activeLabel={list.labels.activeChats}
            allLabel={list.labels.allChats}
            archivedLabel={list.labels.archivedChats}
            label={list.labels.visibility}
            onValueChange={(value) =>
              list.onPrefsChange((prefs) => ({ ...prefs, archived: value }))
            }
            value={list.prefs.archived}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
        "h-auto min-h-16 flex-col items-center gap-1 rounded-md py-2 text-xs hover:bg-card",
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

function CompactFilterSelect(props: {
  children: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  selectedLabel: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <div className="truncate font-medium text-muted-foreground text-xs">
        {props.label}
      </div>
      <Select onValueChange={props.onValueChange} value={props.value}>
        <SelectTrigger className="h-8 w-[11.25rem] justify-self-end text-xs">
          <SelectValue>{props.selectedLabel}</SelectValue>
        </SelectTrigger>
        {props.children}
      </Select>
    </div>
  );
}

function VisibilityFilter(props: {
  activeLabel: string;
  allLabel: string;
  archivedLabel: string;
  label: string;
  onValueChange: (value: SessionListArchivedFilter) => void;
  value: SessionListArchivedFilter;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <div className="truncate font-medium text-muted-foreground text-xs">
        {props.label}
      </div>
      <Tabs
        className="justify-self-end"
        onValueChange={(value) =>
          props.onValueChange(value as SessionListArchivedFilter)
        }
        value={props.value}
      >
        <TabsList className="grid h-8 grid-cols-3 p-0.5">
          <TabsTrigger
            aria-label={props.activeLabel}
            className="h-7 px-2"
            title={props.activeLabel}
            value="active"
          >
            <MessageSquareText className="size-3.5" />
          </TabsTrigger>
          <TabsTrigger
            aria-label={props.archivedLabel}
            className="h-7 px-2"
            title={props.archivedLabel}
            value="archived"
          >
            <Archive className="size-3.5" />
          </TabsTrigger>
          <TabsTrigger
            aria-label={props.allLabel}
            className="h-7 px-2"
            title={props.allLabel}
            value="all"
          >
            <Layers2 className="size-3.5" />
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
