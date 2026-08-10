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
} from "@engenty/ui-core";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CalendarDays,
  CircleDot,
  List,
  ListFilter,
  type LucideIcon,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectsSidebarPrefs } from "../lib/use-projects-sidebar-prefs.js";

// ---------------------------------------------------------------------------
// GroupModeButton
// ---------------------------------------------------------------------------

interface GroupModeButtonProps {
  className?: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  selected: boolean;
}

function GroupModeButton({
  className,
  icon: Icon,
  label,
  onClick,
  selected,
}: GroupModeButtonProps) {
  return (
    <Button
      className={cn(
        "h-auto min-h-16 flex-col items-center gap-1 rounded-md py-2 text-xxs hover:bg-card",
        selected ? "bg-card/90 shadow-sm" : "text-muted-foreground",
        className
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

// ---------------------------------------------------------------------------
// CompactFilterSelect
// ---------------------------------------------------------------------------

interface CompactFilterSelectProps {
  children: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  selectedLabel: string;
  value: string;
}

function CompactFilterSelect({
  children,
  label,
  onValueChange,
  selectedLabel,
  value,
}: CompactFilterSelectProps) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <div className="truncate font-medium text-muted-foreground text-xs">
        {label}
      </div>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger className="h-8 w-[11.25rem] justify-self-end text-xs">
          <SelectValue>{selectedLabel}</SelectValue>
        </SelectTrigger>
        {children}
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectsSidebarListSettings
// ---------------------------------------------------------------------------

export interface ProjectsSidebarListSettingsProps {
  clients: Array<{ id: string; display_name: string }>;
  leads: Array<{ id: string; label: string }>;
  prefs: ProjectsSidebarPrefs;
  updatePrefs: (
    updater: (current: ProjectsSidebarPrefs) => ProjectsSidebarPrefs
  ) => void;
}

export function ProjectsSidebarListSettings({
  clients,
  leads,
  prefs,
  updatePrefs,
}: ProjectsSidebarListSettingsProps) {
  const { t } = useTranslation("projects");
  const selectContentClassName = "z-[110]";

  return (
    <Popover
      onOpenChange={(nextOpen, eventDetails) => {
        if (nextOpen || eventDetails.reason !== "outside-press") {
          return;
        }
        const target = eventDetails.event.target;
        if (
          target instanceof Element &&
          target.closest('[data-slot="select-content"]')
        ) {
          eventDetails.cancel();
        }
      }}
    >
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
        <div className="space-y-1.5 p-2">
          <div className="font-medium text-muted-foreground text-xs">
            {t("filters.groupBy")}
          </div>
          <div className="grid grid-cols-4 gap-1">
            <GroupModeButton
              icon={List}
              label={t("filters.groupByNone")}
              onClick={() =>
                updatePrefs((current) => ({ ...current, groupBy: "none" }))
              }
              selected={prefs.groupBy === "none"}
            />
            <GroupModeButton
              icon={CircleDot}
              label={t("filters.groupByClient")}
              onClick={() =>
                updatePrefs((current) => ({ ...current, groupBy: "client" }))
              }
              selected={prefs.groupBy === "client"}
            />
            <GroupModeButton
              icon={CalendarDays}
              label={t("filters.groupByTimeframe")}
              onClick={() =>
                updatePrefs((current) => ({ ...current, groupBy: "timeframe" }))
              }
              selected={prefs.groupBy === "timeframe"}
            />
            <GroupModeButton
              icon={User}
              label={t("filters.groupByLead")}
              onClick={() =>
                updatePrefs((current) => ({ ...current, groupBy: "lead" }))
              }
              selected={prefs.groupBy === "lead"}
            />
          </div>
        </div>
        <Separator />
        <div className="space-y-2 px-2 py-2">
          <div className="space-y-1.5">
            <div className="font-medium text-muted-foreground text-xs">
              {t("sortBy", { defaultValue: "Sort by" })}
            </div>
            <div className="flex items-center gap-2">
              <Select
                onValueChange={(value) =>
                  updatePrefs((current) => ({
                    ...current,
                    sortBy: value as ProjectsSidebarPrefs["sortBy"],
                  }))
                }
                value={prefs.sortBy}
              >
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue>
                    {prefs.sortBy === "start_date"
                      ? t("list.columns.startDate")
                      : prefs.sortBy === "end_date"
                        ? t("list.columns.endDate")
                        : prefs.sortBy === "created_at"
                          ? t("list.sortByCreatedAt")
                          : t("list.columns.title")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={selectContentClassName}>
                  <SelectItem value="title">
                    {t("list.columns.title")}
                  </SelectItem>
                  <SelectItem value="start_date">
                    {t("list.columns.startDate")}
                  </SelectItem>
                  <SelectItem value="end_date">
                    {t("list.columns.endDate")}
                  </SelectItem>
                  <SelectItem value="created_at">
                    {t("list.sortByCreatedAt")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                aria-label={t("sortOrder", { defaultValue: "Sort order" })}
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
        <Separator />
        <div className="space-y-2 p-2">
          <CompactFilterSelect
            label={t("filters.client")}
            onValueChange={(value) =>
              updatePrefs((current) => ({ ...current, clientId: value }))
            }
            selectedLabel={
              prefs.clientId === "all"
                ? t("filters.allClients")
                : (clients.find((c) => c.id === prefs.clientId)?.display_name ??
                  prefs.clientId)
            }
            value={prefs.clientId}
          >
            <SelectContent className={selectContentClassName}>
              <SelectItem value="all">{t("filters.allClients")}</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </CompactFilterSelect>
          <CompactFilterSelect
            label={t("filters.lead")}
            onValueChange={(value) =>
              updatePrefs((current) => ({ ...current, leadId: value }))
            }
            selectedLabel={
              prefs.leadId === "all"
                ? t("filters.allLeads")
                : (leads.find((l) => l.id === prefs.leadId)?.label ??
                  prefs.leadId)
            }
            value={prefs.leadId}
          >
            <SelectContent className={selectContentClassName}>
              <SelectItem value="all">{t("filters.allLeads")}</SelectItem>
              {leads.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </CompactFilterSelect>
        </div>
      </PopoverContent>
    </Popover>
  );
}
