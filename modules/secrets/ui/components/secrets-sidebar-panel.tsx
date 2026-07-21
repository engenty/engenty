import { useTranslation } from "@engenty/i18n/ui";
import { SidebarContent } from "@engenty/ui-core";
import { useSecondaryNavSearchResultsOnly } from "@engenty/ui-plugin-sdk";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  parseSecretsKindFilter,
  parseSecretsScopeFilter,
  parseSecretsSidebarTab,
  type SecretsSidebarTab,
  type SecretsVaultFilters,
  secretsVaultHref,
} from "../lib/secrets-vault-url.js";
import {
  useClientsQuery,
  useProjectsQuery,
  useSecretsQuery,
} from "../queries.js";
import { SecretsSidebarHeader } from "./secrets-sidebar-header.js";
import { SecretsSidebarList } from "./secrets-sidebar-list.js";

/**
 * Secrets secondary nav: search → All / Personal / Workspace → Clients | Projects tabs.
 * Client/project lists only include entities that own at least one secret.
 */
export function SecretsSidebarPanel() {
  const { i18n } = useTranslation("secrets");
  const navigate = useNavigate();
  const [sidebarSearch, setSidebarSearch] = useState("");
  const trimmed = sidebarSearch.trim();
  const isSearching = trimmed.length > 0;

  useEffect(() => {
    void i18n.loadNamespaces(["secrets"]);
  }, [i18n]);

  useSecondaryNavSearchResultsOnly(true);

  const [q] = useQueryState("q", parseAsString.withDefault(""));
  const [scopeRaw] = useQueryState("scope", parseAsString);
  const [kindRaw] = useQueryState("kind", parseAsString);
  const [client] = useQueryState("client", parseAsString);
  const [project] = useQueryState("project", parseAsString);
  const [tabRaw] = useQueryState("tab", parseAsString);

  const filters = useMemo<SecretsVaultFilters>(
    () => ({
      q,
      scope: parseSecretsScopeFilter(scopeRaw),
      kind: parseSecretsKindFilter(kindRaw),
      client,
      project,
      tab: parseSecretsSidebarTab(tabRaw),
    }),
    [q, scopeRaw, kindRaw, client, project, tabRaw]
  );

  const secretsQuery = useSecretsQuery();
  const clientsQuery = useClientsQuery();
  const projectsQuery = useProjectsQuery();
  const secrets = secretsQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const isLoading =
    secretsQuery.isLoading || clientsQuery.isLoading || projectsQuery.isLoading;

  const { clientIdsWithSecrets, projectIdsWithSecrets } = useMemo(() => {
    const projectById = new Map(projects.map((entry) => [entry.id, entry]));
    const clientIds = new Set<string>();
    const projectIds = new Set<string>();
    for (const secret of secrets) {
      if (secret.owner_scope === "client") {
        clientIds.add(secret.owner_id);
        continue;
      }
      if (secret.owner_scope === "project") {
        projectIds.add(secret.owner_id);
        const ownerProject = projectById.get(secret.owner_id);
        if (ownerProject?.client_id) {
          clientIds.add(ownerProject.client_id);
        }
      }
    }
    return {
      clientIdsWithSecrets: clientIds,
      projectIdsWithSecrets: projectIds,
    };
  }, [secrets, projects]);

  const clientsWithSecrets = useMemo(
    () => clients.filter((entry) => clientIdsWithSecrets.has(entry.id)),
    [clients, clientIdsWithSecrets]
  );

  const projectsWithSecrets = useMemo(
    () => projects.filter((entry) => projectIdsWithSecrets.has(entry.id)),
    [projects, projectIdsWithSecrets]
  );

  const needle = trimmed.toLowerCase();
  const filteredClients = useMemo(() => {
    if (!needle) {
      return clientsWithSecrets;
    }
    return clientsWithSecrets.filter((entry) =>
      entry.display_name.toLowerCase().includes(needle)
    );
  }, [clientsWithSecrets, needle]);

  const filteredProjects = useMemo(() => {
    const base =
      filters.client && !isSearching
        ? projectsWithSecrets.filter(
            (entry) => entry.client_id === filters.client
          )
        : projectsWithSecrets;
    if (!needle) {
      return base;
    }
    return base.filter((entry) => entry.title.toLowerCase().includes(needle));
  }, [projectsWithSecrets, filters.client, isSearching, needle]);

  function handleTabChange(tab: SecretsSidebarTab) {
    navigate(secretsVaultHref({ tab }, filters), { replace: true });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SecretsSidebarHeader
        filters={filters}
        isSearching={isSearching}
        onSearchChange={setSidebarSearch}
        onTabChange={handleTabChange}
        search={sidebarSearch}
      />
      <SidebarContent className="min-h-0 flex-1 gap-0.5 overflow-x-hidden px-0 py-0">
        <SecretsSidebarList
          clients={filteredClients}
          filters={filters}
          isLoading={isLoading}
          isSearching={isSearching}
          projects={filteredProjects}
          tab={filters.tab}
        />
      </SidebarContent>
    </div>
  );
}
