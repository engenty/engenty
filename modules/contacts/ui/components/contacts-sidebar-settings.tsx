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
  ListFilter,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ContactType } from "../../src/schema/index.js";
import type { ContactsSidebarPrefs } from "../lib/use-contacts-sidebar-prefs.js";

const SELECT_CONTENT_CLASS = "z-[110]";

function FilterRow({
  children,
  label,
  onValueChange,
  selectedLabel,
  value,
}: {
  children: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  selectedLabel: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <div className="truncate font-medium text-muted-foreground text-xs">
        {label}
      </div>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger className="h-8 w-[11.25rem] justify-self-end text-xs">
          <SelectValue>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent className={SELECT_CONTENT_CLASS}>
          {children}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The sidebar list's filter popover: sort, then contact type and role. */
export function ContactsSidebarListSettings({
  filtered,
  prefs,
  roleOptions,
  updatePrefs,
}: {
  filtered: boolean;
  prefs: ContactsSidebarPrefs;
  roleOptions: Array<{ label: string; value: string }>;
  updatePrefs: (
    updater: (current: ContactsSidebarPrefs) => ContactsSidebarPrefs
  ) => void;
}) {
  const { t } = useTranslation("contacts");
  const sortLabel = (value: ContactsSidebarPrefs["sortBy"]) =>
    value === "display_name" ? t("sortByName") : t("sortByCreatedAt");
  const typeLabel = (value: ContactsSidebarPrefs["type"]) =>
    value === "person"
      ? t("typePerson")
      : value === "organisation"
        ? t("typeOrganisation")
        : t("roleAll");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("listSidebar.filters")}
          className={cn(
            "size-8 shrink-0 border-0 p-0 shadow-none",
            filtered && "text-primary"
          )}
          title={t("listSidebar.filters")}
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
        <div className="space-y-1.5 px-2 py-2">
          <div className="font-medium text-muted-foreground text-xs">
            {t("listSidebar.sortBy")}
          </div>
          <div className="flex items-center gap-2">
            <Select
              onValueChange={(value) =>
                updatePrefs((current) => ({
                  ...current,
                  sortBy: value as ContactsSidebarPrefs["sortBy"],
                }))
              }
              value={prefs.sortBy}
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue>{sortLabel(prefs.sortBy)}</SelectValue>
              </SelectTrigger>
              <SelectContent className={SELECT_CONTENT_CLASS}>
                {(["created_at", "display_name"] as const).map((option) => (
                  <SelectItem key={option} value={option}>
                    {sortLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              aria-label={
                prefs.sortOrder === "asc" ? t("ascending") : t("descending")
              }
              className="h-8 w-8 shrink-0 p-0"
              onClick={() =>
                updatePrefs((current) => ({
                  ...current,
                  sortOrder: current.sortOrder === "asc" ? "desc" : "asc",
                }))
              }
              title={
                prefs.sortOrder === "asc" ? t("ascending") : t("descending")
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
          <FilterRow
            label={t("listSidebar.filterType")}
            onValueChange={(value) =>
              updatePrefs((current) => ({
                ...current,
                type: value as ContactType | "all",
              }))
            }
            selectedLabel={typeLabel(prefs.type)}
            value={prefs.type}
          >
            {(["all", "organisation", "person"] as const).map((option) => (
              <SelectItem key={option} value={option}>
                {typeLabel(option)}
              </SelectItem>
            ))}
          </FilterRow>
          <FilterRow
            label={t("listSidebar.filterRole")}
            onValueChange={(value) =>
              updatePrefs((current) => ({ ...current, role: value }))
            }
            selectedLabel={
              prefs.role === "all"
                ? t("roleAll")
                : (roleOptions.find((option) => option.value === prefs.role)
                    ?.label ?? prefs.role)
            }
            value={prefs.role}
          >
            <SelectItem value="all">{t("roleAll")}</SelectItem>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </FilterRow>
        </div>
      </PopoverContent>
    </Popover>
  );
}
