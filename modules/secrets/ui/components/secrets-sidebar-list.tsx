import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowButton,
  Skeleton,
} from "@engenty/ui-core";
import { Link } from "react-router-dom";
import type { ClientOption, ProjectOption } from "../api.js";
import {
  type SecretsSidebarTab,
  type SecretsVaultFilters,
  secretsVaultHref,
} from "../lib/secrets-vault-url.js";

function EntityNavRow({
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

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 pl-2">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton
          className="h-6 w-full"
          key={`secrets-sidebar-skel-${index}`}
        />
      ))}
    </div>
  );
}

export function SecretsSidebarList({
  clients,
  filters,
  isLoading,
  isSearching,
  projects,
  tab,
}: {
  clients: ClientOption[];
  filters: SecretsVaultFilters;
  isLoading: boolean;
  isSearching: boolean;
  projects: ProjectOption[];
  tab: SecretsSidebarTab;
}) {
  const { t } = useTranslation("secrets");

  if (isLoading) {
    return (
      <SidebarGroup className="min-h-0 flex-1 p-0">
        <SidebarGroupContent>
          <ListSkeleton />
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isSearching) {
    const hasClients = clients.length > 0;
    const hasProjects = projects.length > 0;
    if (!(hasClients || hasProjects)) {
      return (
        <p className="py-2 pl-2 text-muted-foreground text-xs">
          {t("sidebar.noSearchResults")}
        </p>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        {hasClients ? (
          <SidebarGroup className="p-0">
            <SidebarNavSectionLabel>
              {t("sidebar.tabClients")}
            </SidebarNavSectionLabel>
            <SidebarGroupContent>
              <SidebarNavList>
                {clients.map((client) => (
                  <EntityNavRow
                    active={filters.client === client.id}
                    key={client.id}
                    label={client.display_name}
                    to={secretsVaultHref(
                      {
                        client: client.id,
                        project: null,
                        scope: null,
                        tab: "clients",
                      },
                      filters
                    )}
                  />
                ))}
              </SidebarNavList>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        {hasProjects ? (
          <SidebarGroup className="p-0">
            <SidebarNavSectionLabel>
              {t("sidebar.tabProjects")}
            </SidebarNavSectionLabel>
            <SidebarGroupContent>
              <SidebarNavList>
                {projects.map((project) => (
                  <EntityNavRow
                    active={filters.project === project.id}
                    key={project.id}
                    label={project.title}
                    to={secretsVaultHref(
                      {
                        project: project.id,
                        client: null,
                        scope: null,
                        tab: "projects",
                      },
                      filters
                    )}
                  />
                ))}
              </SidebarNavList>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </div>
    );
  }

  const items =
    tab === "clients"
      ? clients.map((client) => ({
          id: client.id,
          label: client.display_name,
          active: filters.client === client.id,
          to: secretsVaultHref(
            {
              client: client.id,
              project: null,
              scope: null,
              tab: "clients",
            },
            filters
          ),
        }))
      : projects.map((project) => ({
          id: project.id,
          label: project.title,
          active: filters.project === project.id,
          to: secretsVaultHref(
            {
              project: project.id,
              client: null,
              scope: null,
              tab: "projects",
            },
            filters
          ),
        }));

  if (items.length === 0) {
    return (
      <p className="py-2 pl-2 text-muted-foreground text-xs">
        {tab === "clients" ? t("sidebar.noClients") : t("sidebar.noProjects")}
      </p>
    );
  }

  return (
    <SidebarGroup className="min-h-0 flex-1 p-0">
      <SidebarGroupContent className="min-h-0 flex-1">
        <SidebarNavList className="min-h-0 flex-1 overflow-y-auto pb-2">
          {items.map((item) => (
            <EntityNavRow
              active={item.active}
              key={item.id}
              label={item.label}
              to={item.to}
            />
          ))}
        </SidebarNavList>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
