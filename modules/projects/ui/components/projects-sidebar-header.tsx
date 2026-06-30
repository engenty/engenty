import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Input,
  SidebarHeader,
  SidebarNavList,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
} from "@engenty/ui-core";
import { DockProjectsIcon } from "@engenty/ui-icons";
import { Plus, Search, type Settings, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { ProjectsSidebarPrefs } from "../lib/use-projects-sidebar-prefs.js";
import { ProjectsSidebarListSettings } from "./projects-sidebar-settings.js";

interface SidebarNavRowProps {
  active: boolean;
  createAriaLabel?: string;
  icon?: typeof Settings;
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
  pathname: string;
  prefs: ProjectsSidebarPrefs;
  search: string;
  trimmed: string;
  updatePrefs: (
    updater: (current: ProjectsSidebarPrefs) => ProjectsSidebarPrefs
  ) => void;
}

export function ProjectsSidebarHeader({
  clients,
  isSearching,
  leads,
  onClearSearch,
  onCreateProject,
  onSearchChange,
  pathname,
  prefs,
  search,
  trimmed,
  updatePrefs,
}: ProjectsSidebarHeaderProps) {
  const { t } = useTranslation("projects");

  return (
    <SidebarHeader className="gap-0 p-0 pb-3">
      <div className="flex min-w-0 items-center gap-1 pr-1 pl-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
          />
          <Input
            aria-label={t("sidebar.searchAria", {
              defaultValue: "Search projects",
            })}
            className="h-8 w-full py-0 pr-7 pl-8 text-sm"
            onChange={(e) => onSearchChange(e.target.value)}
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
              className="absolute top-1/2 right-1 h-6 w-6 shrink-0 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
        {isSearching ? null : (
          <>
            <ProjectsSidebarListSettings
              clients={clients}
              leads={leads}
              prefs={prefs}
              updatePrefs={updatePrefs}
            />
            <Button
              aria-label={t("list.addProject")}
              className="h-8 w-8 shrink-0 border-0 p-0 shadow-none"
              onClick={onCreateProject}
              title={t("list.addProject")}
              type="button"
              variant="ghost"
              {...shellSecondaryNavItemProps}
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {isSearching ? null : (
        <SidebarNavList className="pt-2">
          <SidebarNavRow
            active={pathname === "/mdl/projects"}
            icon={DockProjectsIcon}
            label={t("menu.projects")}
            to="/mdl/projects"
          />
        </SidebarNavList>
      )}
    </SidebarHeader>
  );
}
