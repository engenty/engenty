import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Input,
  SidebarHeader,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import { Plus, Search, X } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Link } from "react-router-dom";
import type { ProjectsSidebarPrefs } from "../lib/use-projects-sidebar-prefs.js";
import { ProjectsSidebarListSettings } from "./projects-sidebar-settings.js";

interface SidebarNavRowProps {
  active: boolean;
  createAriaLabel?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onCreate?: () => void;
  to: string;
}

export function SidebarNavRow({
  active,
  icon: Icon,
  label,
  to,
  onCreate,
  createAriaLabel,
}: SidebarNavRowProps) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link to={to} {...shellSecondaryNavItemProps}>
          {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
      {onCreate ? (
        <SidebarRowActions>
          <Button
            aria-label={createAriaLabel}
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCreate();
            }}
            title={createAriaLabel}
            type="button"
            variant="ghost"
            {...shellSecondaryNavItemProps}
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
          </Button>
        </SidebarRowActions>
      ) : null}
    </SidebarRow>
  );
}

interface ProjectsSidebarHeaderProps {
  clients: Array<{ id: string; display_name: string }>;
  isSearching: boolean;
  leads: Array<{ id: string; label: string }>;
  onClearSearch: () => void;
  onCreateProject: () => void;
  onSearchChange: (value: string) => void;
  prefs: ProjectsSidebarPrefs;
  search: string;
  trimmed: string;
  updatePrefs: (
    updater: (current: ProjectsSidebarPrefs) => ProjectsSidebarPrefs
  ) => void;
}

/**
 * One row above the project list: the search field, list settings and "new
 * project". The field has a light border so it reads as part of the column
 * rather than a form; focused, it takes the whole row and a darker border. The module's name is the column's title and already
 * links to the list, so there is no "Projekte" row here.
 */
export function ProjectsSidebarHeader({
  clients,
  isSearching,
  leads,
  onClearSearch,
  onCreateProject,
  onSearchChange,
  prefs,
  search,
  trimmed,
  updatePrefs,
}: ProjectsSidebarHeaderProps) {
  const { t } = useTranslation("projects");

  return (
    <SidebarHeader className="gap-0 p-0 pb-2">
      <div
        className={cn(
          "group/search flex min-w-0 items-center gap-0.5",
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
              defaultValue: "Search projects",
            })}
            className="h-8 w-full border-border-soft bg-transparent py-0 pr-7 pl-7 text-sm shadow-none focus-visible:border-foreground/35 focus-visible:ring-0"
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onClearSearch();
              }
            }}
            placeholder={t("sidebar.searchPlaceholder", {
              defaultValue: "Search projects...",
            })}
            value={search}
            {...shellSecondaryNavItemProps}
          />
          {trimmed ? (
            <Button
              aria-label={t("sidebar.clearSearch", {
                defaultValue: "Clear search",
              })}
              className="absolute top-1/2 right-0.5 h-6 w-6 shrink-0 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={onClearSearch}
              size="icon"
              tabIndex={-1}
              type="button"
              variant="ghost"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
        {/* Folds away while the field has focus, so it spans the column.
            `max-w` rather than `hidden`: display does not animate. */}
        <div className="flex max-w-16 shrink-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity] duration-200 ease-out group-has-[input:focus]/search:max-w-0 group-has-[input:focus]/search:opacity-0">
          {isSearching ? null : (
            <ProjectsSidebarListSettings
              clients={clients}
              leads={leads}
              prefs={prefs}
              updatePrefs={updatePrefs}
            />
          )}
          <Button
            aria-label={t("list.addProject")}
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={onCreateProject}
            title={t("list.addProject")}
            type="button"
            variant="ghost"
            {...shellSecondaryNavItemProps}
          >
            <Plus aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>
    </SidebarHeader>
  );
}
