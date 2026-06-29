// Unified agents catalog (ui-6 §2): one registry query, card grid default,
// table view behind the switcher, role/source filters, custom CRUD entry.

import { useShellSecondaryNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListCardsView,
  AdminListTableView,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  useListDisplayState,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AgentDeleteDialog } from "../features/agents-catalog/agent-delete-dialog";
import { AgentsCardGrid } from "../features/agents-catalog/agents-card-grid";
import {
  AGENT_GROUP_LABEL_KEYS,
  type AgentRoleFilter,
  type AgentSourceFilter,
  filterAgents,
  groupAgentsCatalog,
  parseAgentRoleFilter,
  parseAgentSourceFilter,
} from "../features/agents-catalog/agents-catalog-state";
import { AgentsCatalogTable } from "../features/agents-catalog/agents-catalog-table";
import { AgentsCatalogToolbar } from "../features/agents-catalog/agents-catalog-toolbar";
import { AGENTS_WORKSPACE_ROOT_PATH } from "../features/agents-workspace/agent-workspace-paths";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { useAiAgentsQuery } from "../lib/admin/ai-runtime-queries";
import type { AiRegisteredAgent } from "../lib/admin/ai-runtime-types";

const AGENTS_DISPLAY_DEFAULTS = {
  columnOrder: [] as string[],
  columnVisibility: {} as Record<string, boolean>,
  sortBy: "name",
  sortOrder: "asc" as const,
  tableSize: "compact" as const,
  viewMode: "cards" as const,
};

export function AgentsCatalogPage() {
  const { t } = useTranslation("ai-ui");
  const nav = useWorkspaceNavData();
  const agentsQuery = useAiAgentsQuery();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AgentRoleFilter>(() =>
    parseAgentRoleFilter(searchParams.get("role"))
  );
  const [sourceFilter, setSourceFilter] = useState<AgentSourceFilter>(() =>
    parseAgentSourceFilter(searchParams.get("source"))
  );
  const [pendingDelete, setPendingDelete] = useState<AiRegisteredAgent | null>(
    null
  );
  const [filtersExpanded, setFiltersExpanded] = useState(
    () =>
      parseAgentRoleFilter(searchParams.get("role")) !== "all" ||
      parseAgentSourceFilter(searchParams.get("source")) !== "all"
  );

  const { setViewMode, viewMode } = useListDisplayState({
    defaults: AGENTS_DISPLAY_DEFAULTS,
    storageKey: "ai-agents-catalog",
    validSortColumns: ["name"],
    validViewModes: ["table", "cards"],
  });

  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const isGroupOpen = useCallback(
    (id: string) => !collapsedGroups[id],
    [collapsedGroups]
  );
  const toggleGroup = useCallback(
    (id: string) =>
      setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] })),
    []
  );

  const agents = agentsQuery.data?.agents;
  const filteredAgents = useMemo(
    () => filterAgents(agents ?? [], { roleFilter, searchQuery, sourceFilter }),
    [agents, roleFilter, searchQuery, sourceFilter]
  );
  const agentGroups = useMemo(
    () =>
      groupAgentsCatalog(filteredAgents, (group) =>
        t(AGENT_GROUP_LABEL_KEYS[group])
      ),
    [filteredAgents, t]
  );

  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });
  const { secondaryNavOpen } = useShellSecondaryNav();

  usePageConfig({
    // "New agent" action hidden for now — custom-agent creation is not yet wired
    // end-to-end on apps/ai. Re-add the actions button once the create flow works.
    breadcrumbs: [
      ...(secondaryNavOpen
        ? []
        : [{ label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH }]),
      { label: t("workspace.sidebarAgents") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const isEmpty = !agentsQuery.isLoading && (agents ?? []).length === 0;
  const noResults =
    !agentsQuery.isLoading &&
    (agents ?? []).length > 0 &&
    filteredAgents.length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-page">
      <AgentDeleteDialog
        agent={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />

      <AgentsCatalogToolbar
        agentCount={filteredAgents.length}
        filtersExpanded={filtersExpanded}
        hasActiveFilters={roleFilter !== "all" || sourceFilter !== "all"}
        onFiltersToggle={() => setFiltersExpanded((v) => !v)}
        onRoleFilterChange={setRoleFilter}
        onSearchChange={setSearchQuery}
        onSourceFilterChange={setSourceFilter}
        onViewModeChange={setViewMode}
        roleFilter={roleFilter}
        searchQuery={searchQuery}
        sourceFilter={sourceFilter}
        viewMode={viewMode}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {agentsQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-28 rounded-lg" key={index} />
            ))}
          </div>
        ) : null}

        {isEmpty || noResults ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                {noResults
                  ? t("agentsCatalog.noResults")
                  : t("agentsCatalog.empty")}
              </EmptyTitle>
              <EmptyDescription>
                {t("agentsCatalog.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {filteredAgents.length > 0 && viewMode !== "table" ? (
          <AdminListCardsView bottomFade variant="default">
            <AgentsCardGrid
              groups={agentGroups}
              isGroupOpen={isGroupOpen}
              onDelete={setPendingDelete}
              onToggleGroup={toggleGroup}
            />
          </AdminListCardsView>
        ) : null}

        {filteredAgents.length > 0 && viewMode === "table" ? (
          <AdminListTableView
            bottomFade
            scrollClassName="rounded-lg"
            stickyHeaderShadow
            transparent
          >
            <AgentsCatalogTable
              grouped
              groups={agentGroups}
              isGroupOpen={isGroupOpen}
              onDelete={setPendingDelete}
              onToggleGroup={toggleGroup}
            />
          </AdminListTableView>
        ) : null}
      </div>
    </section>
  );
}
