import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Input,
  SidebarHeader,
  SidebarNavList,
  SidebarRow,
  SidebarRowButton,
  SidebarTab,
  SidebarTabStrip,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import { Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  type SecretsSidebarTab,
  type SecretsVaultFilters,
  secretsVaultHref,
} from "../lib/secrets-vault-url.js";

function EntryNavRow({
  active,
  label,
  to,
}: {
  active: boolean;
  label: string;
  to: string;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link to={to} {...shellSecondaryNavItemProps}>
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

export function SecretsSidebarHeader({
  filters,
  isSearching,
  onSearchChange,
  onTabChange,
  search,
}: {
  filters: SecretsVaultFilters;
  isSearching: boolean;
  onSearchChange: (value: string) => void;
  onTabChange: (tab: SecretsSidebarTab) => void;
  search: string;
}) {
  const { t } = useTranslation("secrets");
  const trimmed = search.trim();

  const allActive = !(filters.scope || filters.client || filters.project);
  const personalActive =
    filters.scope === "user" && !filters.client && !filters.project;
  const workspaceActive =
    filters.scope === "tenant" && !filters.client && !filters.project;

  return (
    <SidebarHeader className="gap-0 p-0 pb-3">
      <div
        className={cn(
          "flex min-w-0 items-center",
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
            aria-label={t("sidebar.searchAria")}
            className="h-8 w-full py-0 pr-7 pl-8 text-sm"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            value={search}
            {...shellSecondaryNavItemProps}
          />
          {trimmed ? (
            <Button
              aria-label={t("sidebar.clearSearch")}
              className="absolute top-1/2 right-1 h-6 w-6 shrink-0 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => onSearchChange("")}
              size="icon"
              tabIndex={-1}
              type="button"
              variant="ghost"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {isSearching ? null : (
        <>
          <SidebarNavList className="pt-2">
            <EntryNavRow
              active={allActive}
              label={t("sidebar.all")}
              to={secretsVaultHref(
                { scope: null, client: null, project: null },
                filters
              )}
            />
            <EntryNavRow
              active={personalActive}
              label={t("sidebar.personal")}
              to={secretsVaultHref(
                { scope: "user", client: null, project: null },
                filters
              )}
            />
            <EntryNavRow
              active={workspaceActive}
              label={t("sidebar.workspace")}
              to={secretsVaultHref(
                { scope: "tenant", client: null, project: null },
                filters
              )}
            />
          </SidebarNavList>

          <div className="mt-2 shrink-0 border-border/50 border-t" />

          <SidebarTabStrip
            onValueChange={(value) => onTabChange(value as SecretsSidebarTab)}
            value={filters.tab}
          >
            <SidebarTab value="clients">{t("sidebar.tabClients")}</SidebarTab>
            <SidebarTab value="projects">{t("sidebar.tabProjects")}</SidebarTab>
          </SidebarTabStrip>
        </>
      )}
    </SidebarHeader>
  );
}
