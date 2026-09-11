import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
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
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CalendarDays,
  CircleDot,
  Flag,
  FolderKanban,
  List,
  ListFilter,
  type LucideIcon,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import type { TaskStatusDefinition } from "../../src/schema/types.js";
import {
  formatTaskAgentFilterLabel,
  type TasksSidebarAssigneeFilter,
  type TasksSidebarPrefs,
  type TasksSidebarSortBy,
} from "../lib/tasks-sidebar-organization.js";

interface TasksSidebarListSettingsProps {
  agentFilterOptions: string[];
  onTasksPrefsChange: (
    updater: (current: TasksSidebarPrefs["tasks"]) => TasksSidebarPrefs["tasks"]
  ) => void;
  prefs: TasksSidebarPrefs;
  taskStatusDefinitions: readonly TaskStatusDefinition[];
  teamMembersEnabled: boolean;
  userFilterOptions: Array<{ id: string; label: string }>;
}

export function TasksSidebarListSettings({
  agentFilterOptions,
  onTasksPrefsChange,
  prefs,
  taskStatusDefinitions,
  teamMembersEnabled,
  userFilterOptions,
}: TasksSidebarListSettingsProps) {
  const { t } = useTranslation("tasks");
  const selectContentClassName = "z-[110]";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("sidebar.listSettings")}
          className="size-8 shrink-0 border-0 p-0 shadow-none"
          title={t("sidebar.listSettings")}
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
        <div
          className="contents"
          onPointerDownCapture={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest('[data-slot="select-content"]')
            ) {
              event.stopPropagation();
            }
          }}
        >
          <div className="space-y-1.5 p-2">
            <div className="font-medium text-muted-foreground text-xs">
              {t("sidebar.groupBy")}
            </div>
            <div className="grid grid-cols-3 gap-1">
              <GroupModeButton
                icon={List}
                label={t("sidebar.groupNoneShort")}
                onClick={() =>
                  onTasksPrefsChange((current) => ({
                    ...current,
                    groupBy: "none",
                  }))
                }
                selected={prefs.tasks.groupBy === "none"}
              />
              <GroupModeButton
                icon={CircleDot}
                label={t("sidebar.groupStatus")}
                onClick={() =>
                  onTasksPrefsChange((current) => ({
                    ...current,
                    groupBy: "status",
                  }))
                }
                selected={prefs.tasks.groupBy === "status"}
              />
              <GroupModeButton
                icon={Flag}
                label={t("sidebar.groupPriority")}
                onClick={() =>
                  onTasksPrefsChange((current) => ({
                    ...current,
                    groupBy: "priority",
                  }))
                }
                selected={prefs.tasks.groupBy === "priority"}
              />
              <GroupModeButton
                icon={User}
                label={t("sidebar.groupAssignee")}
                onClick={() =>
                  onTasksPrefsChange((current) => ({
                    ...current,
                    groupBy: "assignee",
                  }))
                }
                selected={prefs.tasks.groupBy === "assignee"}
              />
              <GroupModeButton
                icon={FolderKanban}
                label={t("sidebar.groupProject")}
                onClick={() =>
                  onTasksPrefsChange((current) => ({
                    ...current,
                    groupBy: "project",
                  }))
                }
                selected={prefs.tasks.groupBy === "project"}
              />
              <GroupModeButton
                icon={CalendarDays}
                label={t("sidebar.groupDueDate")}
                onClick={() =>
                  onTasksPrefsChange((current) => ({
                    ...current,
                    groupBy: "due_date",
                  }))
                }
                selected={prefs.tasks.groupBy === "due_date"}
              />
            </div>
          </div>
          <Separator />
          <div className="space-y-2 px-2 py-2">
            <div className="space-y-1.5">
              <div className="font-medium text-muted-foreground text-xs">
                {t("sidebar.sortBy")}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  onValueChange={(value) =>
                    onTasksPrefsChange((current) => ({
                      ...current,
                      sortBy: value as TasksSidebarSortBy,
                    }))
                  }
                  value={prefs.tasks.sortBy}
                >
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    {t(
                      prefs.tasks.sortBy === "updated_at"
                        ? "sidebar.sortUpdated"
                        : prefs.tasks.sortBy === "created_at"
                          ? "sidebar.sortCreated"
                          : prefs.tasks.sortBy === "title"
                            ? "sidebar.sortTitle"
                            : prefs.tasks.sortBy === "status"
                              ? "sidebar.sortStatus"
                              : "sidebar.sortIdentifier"
                    )}
                  </SelectTrigger>
                  <SelectContent className={selectContentClassName}>
                    <SelectItem value="updated_at">
                      {t("sidebar.sortUpdated")}
                    </SelectItem>
                    <SelectItem value="created_at">
                      {t("sidebar.sortCreated")}
                    </SelectItem>
                    <SelectItem value="title">
                      {t("sidebar.sortTitle")}
                    </SelectItem>
                    <SelectItem value="status">
                      {t("sidebar.sortStatus")}
                    </SelectItem>
                    <SelectItem value="identifier">
                      {t("sidebar.sortIdentifier")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Tabs
                  className="shrink-0"
                  onValueChange={(value) =>
                    onTasksPrefsChange((current) => ({
                      ...current,
                      sortOrder: value as "asc" | "desc",
                    }))
                  }
                  value={prefs.tasks.sortOrder}
                >
                  <TabsList className="h-8 p-0.5">
                    <TabsTrigger
                      aria-label={t("sidebar.sortAscending")}
                      className="h-7 w-8 p-0"
                      title={t("sidebar.sortAscending")}
                      value="asc"
                    >
                      <ArrowUpWideNarrow className="size-3.5" />
                    </TabsTrigger>
                    <TabsTrigger
                      aria-label={t("sidebar.sortDescending")}
                      className="h-7 w-8 p-0"
                      title={t("sidebar.sortDescending")}
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
              label={t("sidebar.filterStatus")}
              onValueChange={(value) =>
                onTasksPrefsChange((current) => ({
                  ...current,
                  status: value,
                }))
              }
              selectedLabel={
                prefs.tasks.status === "all"
                  ? t("sidebar.allStatuses")
                  : (taskStatusDefinitions.find(
                      (d) => d.id === prefs.tasks.status
                    )?.label ?? prefs.tasks.status)
              }
              value={prefs.tasks.status}
            >
              <SelectContent className={selectContentClassName}>
                <SelectItem value="all">{t("sidebar.allStatuses")}</SelectItem>
                {taskStatusDefinitions.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </CompactFilterSelect>
            <CompactFilterSelect
              label={t("sidebar.filterAssignee")}
              onValueChange={(value) =>
                onTasksPrefsChange((current) => ({
                  ...current,
                  assigneeFilter: value as TasksSidebarAssigneeFilter,
                }))
              }
              selectedLabel={(() => {
                const v = prefs.tasks.assigneeFilter;
                if (v === "all") {
                  return t("sidebar.allAssignees");
                }
                if (v === "none") {
                  return t("sidebar.unassigned");
                }
                if (v.startsWith("user:")) {
                  const id = v.slice(5);
                  return (
                    userFilterOptions.find((m) => m.id === id)?.label ?? id
                  );
                }
                if (v.startsWith("agent:")) {
                  return formatTaskAgentFilterLabel(v.slice(6));
                }
                return v;
              })()}
              value={prefs.tasks.assigneeFilter}
            >
              <SelectContent className={selectContentClassName}>
                <SelectItem value="all">{t("sidebar.allAssignees")}</SelectItem>
                <SelectItem value="none">{t("sidebar.unassigned")}</SelectItem>
                {teamMembersEnabled
                  ? userFilterOptions.map((member) => (
                      <SelectItem key={member.id} value={`user:${member.id}`}>
                        {member.label}
                      </SelectItem>
                    ))
                  : null}
                {agentFilterOptions.map((agentKey) => (
                  <SelectItem key={agentKey} value={`agent:${agentKey}`}>
                    {formatTaskAgentFilterLabel(agentKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </CompactFilterSelect>
          </div>
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
