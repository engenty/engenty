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
  CircleDot,
  List,
  ListFilter,
  type LucideIcon,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import type { OfferStatus } from "../api.js";
import type { OffersSidebarPrefs } from "../lib/use-offers-sidebar-prefs.js";

interface GroupModeButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  selected: boolean;
}

function GroupModeButton({
  icon: Icon,
  label,
  onClick,
  selected,
}: GroupModeButtonProps) {
  return (
    <Button
      className={cn(
        "h-auto min-h-16 flex-col items-center gap-1 rounded-md py-2 text-xxs hover:bg-card",
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

export interface OffersSidebarListSettingsProps {
  clients: Array<{ id: string; display_name: string }>;
  prefs: OffersSidebarPrefs;
  statusLabel: (status: OfferStatus) => string;
  updatePrefs: (
    updater: (current: OffersSidebarPrefs) => OffersSidebarPrefs
  ) => void;
}

const SORT_OPTIONS: OffersSidebarPrefs["sortBy"][] = [
  "title",
  "offer_number",
  "offer_date",
  "created_at",
];

const STATUS_OPTIONS: OfferStatus[] = ["draft", "ready", "accepted"];

export function OffersSidebarListSettings({
  clients,
  prefs,
  statusLabel,
  updatePrefs,
}: OffersSidebarListSettingsProps) {
  const { t } = useTranslation("offers");
  const selectContentClassName = "z-[110]";

  const sortLabel = (value: OffersSidebarPrefs["sortBy"]) =>
    t(`sidebar.sort.${value}`, {
      defaultValue:
        value === "title"
          ? "Title"
          : value === "offer_number"
            ? "Number"
            : value === "offer_date"
              ? "Offer date"
              : "Created",
    });

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
        <div className="space-y-1.5 p-2">
          <div className="font-medium text-muted-foreground text-xs">
            {t("sidebar.groupBy", { defaultValue: "Group by" })}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <GroupModeButton
              icon={List}
              label={t("sidebar.groupByNone", { defaultValue: "No grouping" })}
              onClick={() =>
                updatePrefs((current) => ({ ...current, groupBy: "none" }))
              }
              selected={prefs.groupBy === "none"}
            />
            <GroupModeButton
              icon={CircleDot}
              label={t("sidebar.groupByClient", { defaultValue: "Customer" })}
              onClick={() =>
                updatePrefs((current) => ({ ...current, groupBy: "client" }))
              }
              selected={prefs.groupBy === "client"}
            />
            <GroupModeButton
              icon={Workflow}
              label={t("sidebar.groupByStatus", { defaultValue: "Status" })}
              onClick={() =>
                updatePrefs((current) => ({ ...current, groupBy: "status" }))
              }
              selected={prefs.groupBy === "status"}
            />
          </div>
        </div>
        <Separator />
        <div className="space-y-1.5 px-2 py-2">
          <div className="font-medium text-muted-foreground text-xs">
            {t("sidebar.sortBy", { defaultValue: "Sort by" })}
          </div>
          <div className="flex items-center gap-2">
            <Select
              onValueChange={(value) =>
                updatePrefs((current) => ({
                  ...current,
                  sortBy: value as OffersSidebarPrefs["sortBy"],
                }))
              }
              value={prefs.sortBy}
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue>{sortLabel(prefs.sortBy)}</SelectValue>
              </SelectTrigger>
              <SelectContent className={selectContentClassName}>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {sortLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              aria-label={t("sidebar.sortOrder", {
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
        <Separator />
        <div className="space-y-2 p-2">
          <CompactFilterSelect
            label={t("sidebar.filterStatus", { defaultValue: "Status" })}
            onValueChange={(value) =>
              updatePrefs((current) => ({
                ...current,
                status: value as OffersSidebarPrefs["status"],
              }))
            }
            selectedLabel={
              prefs.status === "all"
                ? t("sidebar.allStatuses", { defaultValue: "All statuses" })
                : statusLabel(prefs.status)
            }
            value={prefs.status}
          >
            <SelectContent className={selectContentClassName}>
              <SelectItem value="all">
                {t("sidebar.allStatuses", { defaultValue: "All statuses" })}
              </SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </CompactFilterSelect>
          <CompactFilterSelect
            label={t("sidebar.filterClient", { defaultValue: "Customer" })}
            onValueChange={(value) =>
              updatePrefs((current) => ({ ...current, clientId: value }))
            }
            selectedLabel={
              prefs.clientId === "all"
                ? t("sidebar.allClients", { defaultValue: "All customers" })
                : (clients.find((c) => c.id === prefs.clientId)?.display_name ??
                  prefs.clientId)
            }
            value={prefs.clientId}
          >
            <SelectContent className={selectContentClassName}>
              <SelectItem value="all">
                {t("sidebar.allClients", { defaultValue: "All customers" })}
              </SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </CompactFilterSelect>
        </div>
      </PopoverContent>
    </Popover>
  );
}
