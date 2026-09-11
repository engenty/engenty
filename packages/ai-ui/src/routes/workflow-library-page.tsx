// The Workflow library — the shared workflows of this workspace.
//
// ONE list from two sources: graphs drawn in the canvas and workflows shipped
// as module definitions, which compile to a one-node graph the first time they
// are pressed. Where a runnable came from is a filter chip, not a second catalog.
// Only library rows appear here — a specialist-owned workflow lives on its
// specialist's page. Same chrome, toolbar kit and view toggle as the sibling
// catalogs (Agents, Skills, Tools) — a workflow list is a list.
import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListCardsView,
  AdminListTableView,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  useListDisplayState,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildWorkflowDetailPath,
} from "../features/agents-workspace/agent-workspace-url-state";
import { EngentyCatalogPageChrome } from "../features/agents-workspace/engenty-catalog-page-chrome";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { CreateWorkflowDialog } from "../features/workflow-canvas/create-workflow-dialog";
import { WorkflowLibraryCards } from "../features/workflow-canvas/workflow-flows-cards";
import {
  buildFlowCatalog,
  FLOW_FILTER_ALL,
  type FlowSourceFilter,
  type FlowStatusFilter,
  filterFlows,
  getFlowSubjects,
  libraryActions,
  libraryWorkflows,
  type WorkflowCatalogEntry,
} from "../features/workflow-canvas/workflow-flows-state";
import { WorkflowLibraryTable } from "../features/workflow-canvas/workflow-flows-table";
import { WorkflowLibraryToolbar } from "../features/workflow-canvas/workflow-flows-toolbar";
import { useWorkflowListQuery } from "../features/workflow-canvas/workflow-queries";
import { useAiWorkflowsQuery } from "../lib/admin/ai-runtime-queries";

const FLOWS_DISPLAY_DEFAULTS = {
  columnOrder: [] as string[],
  columnVisibility: {} as Record<string, boolean>,
  sortBy: "name",
  sortOrder: "asc" as const,
  tableSize: "compact" as const,
  // Cards: a flow is picked by reading what it does.
  viewMode: "cards" as const,
};

export function WorkflowLibraryPage() {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const nav = useWorkspaceNavData();
  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FlowStatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<FlowSourceFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>(FLOW_FILTER_ALL);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const { setViewMode, viewMode } = useListDisplayState({
    defaults: FLOWS_DISPLAY_DEFAULTS,
    storageKey: "ai-action-flows",
    validSortColumns: ["name"],
    validViewModes: ["table", "cards"],
  });

  const query = useWorkflowListQuery();
  const actionsQuery = useAiWorkflowsQuery();
  const flows = useMemo(
    () =>
      buildFlowCatalog(
        libraryWorkflows(query.data?.graphs ?? []),
        libraryActions(actionsQuery.data?.workflows ?? [])
      ),
    [query.data?.graphs, actionsQuery.data?.workflows]
  );
  const subjects = useMemo(() => getFlowSubjects(flows), [flows]);
  const filtered = useMemo(
    () =>
      filterFlows(flows, {
        searchQuery,
        sourceFilter,
        statusFilter,
        subjectFilter,
      }),
    [flows, searchQuery, sourceFilter, statusFilter, subjectFilter]
  );

  // The row is the ACTION, so a declared one always opens its own page —
  // its Steps tab shows the compiled graph. Only an action authored on the
  // canvas (no module workflow) is addressed by its graph id.
  const openDetail = useCallback(
    (entry: WorkflowCatalogEntry) =>
      navigate(buildWorkflowDetailPath(entry.workflowId ?? entry.id)),
    [navigate]
  );

  // Memoized: `usePageConfig` re-registers whenever `actions` is a new node,
  // and a fresh element every render would churn the topbar on every keystroke.
  const actions = useMemo(
    () => (
      <Button className="gap-1.5" onClick={() => setCreateOpen(true)} size="sm">
        <Plus aria-hidden className="size-4" />
        {t("workflows.new")}
      </Button>
    ),
    [t]
  );

  usePageConfig({
    actions,
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("workflows.title") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarOverlap: true,
  });

  // Nothing at all is a different situation from "nothing matched": the first
  // needs an invitation to create, the second needs the filters relaxed.
  const isLoading = query.isLoading || actionsQuery.isLoading;
  const isEmpty = !isLoading && flows.length === 0;
  const noResults = !isLoading && flows.length > 0 && filtered.length === 0;

  return (
    <EngentyCatalogPageChrome
      description={t("workflows.subtitle")}
      tab="flows"
      title={t("workflows.title")}
    >
      <WorkflowLibraryToolbar
        filtersExpanded={filtersExpanded}
        onFiltersToggle={() => setFiltersExpanded((open) => !open)}
        onSearchChange={setSearchQuery}
        onSourceFilterChange={setSourceFilter}
        onStatusFilterChange={setStatusFilter}
        onSubjectFilterChange={setSubjectFilter}
        onViewModeChange={setViewMode}
        searchQuery={searchQuery}
        shownCount={filtered.length}
        sourceFilter={sourceFilter}
        statusFilter={statusFilter}
        subjectFilter={subjectFilter}
        subjects={subjects}
        totalCount={flows.length}
        viewMode={viewMode}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-12 rounded-lg" key={index} />
            ))}
          </div>
        ) : null}

        {isEmpty || noResults ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                {noResults ? t("workflows.noResults") : t("workflows.empty")}
              </EmptyTitle>
              <EmptyDescription>
                {noResults
                  ? t("workflows.noResultsHint")
                  : t("workflows.emptyHint")}
              </EmptyDescription>
            </EmptyHeader>
            {isEmpty ? (
              <Button
                onClick={() => setCreateOpen(true)}
                size="sm"
                variant="outline"
              >
                <Plus aria-hidden className="mr-1.5 size-3.5" />
                {t("workflows.new")}
              </Button>
            ) : null}
          </Empty>
        ) : null}

        {filtered.length > 0 && viewMode === "cards" ? (
          <AdminListCardsView bottomFade>
            <WorkflowLibraryCards flows={filtered} onOpen={openDetail} />
          </AdminListCardsView>
        ) : null}

        {filtered.length > 0 && viewMode === "table" ? (
          <AdminListTableView
            bottomFade
            scrollClassName="rounded-lg"
            stickyHeaderShadow
            transparent
          >
            <WorkflowLibraryTable flows={filtered} onOpen={openDetail} />
          </AdminListTableView>
        ) : null}
      </div>

      <CreateWorkflowDialog
        onCreated={(graphId) => navigate(buildWorkflowDetailPath(graphId))}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
    </EngentyCatalogPageChrome>
  );
}
