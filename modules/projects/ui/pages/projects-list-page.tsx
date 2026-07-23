import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  buildAssigneeProfileMap,
  type TeamMemberCatalogRow,
  useTeamMembersCatalogQuery,
} from "@engenty/tasks/ui/assignee";
import {
  AdminListCardsView,
  AdminListGroupHeader,
  AdminListGroupPill,
  AdminListPagination,
  AdminListTableView,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useListDisplayState,
  useTableSelection,
} from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { FolderPlus, Plus, Settings, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProjectListItem } from "../api.js";
import { ProjectCreateModal } from "../components/project-create-modal.js";
import { ProjectListFilterBar } from "../components/project-list-filter-bar.js";
import {
  hasActiveProjectListChipFilters,
  hasActiveProjectListFilters,
  type ProjectListFilterState,
} from "../components/project-list-filters.js";
import { ProjectsCards } from "../components/projects-cards.js";
import { ProjectsDeleteConfirmDialog } from "../components/projects-delete-confirm-dialog.js";
import {
  type ProjectsColumnVisibility,
  type ProjectsSortColumn,
  ProjectsTableToolbar,
} from "../components/projects-display-dialog.js";
import { ProjectsTable } from "../components/projects-table.js";
import { useProjectsListAgentUiSlice } from "../hooks/use-projects-agent-ui-slice.js";
import { useProjectsListTaskProgress } from "../hooks/use-projects-list-task-progress.js";
import { useProjectsModuleSecondaryShellNav } from "../hooks/use-projects-module-secondary-shell-nav.js";
import { buildProjectsListGroups } from "../lib/project-list-grouping.js";
import { getProjectsToolbarLabels } from "../lib/projects-toolbar-labels.js";
import { useDeleteProjectMutation, useProjectsList } from "../queries.js";

/** Stable fallback so `useEffect` deps are not a new [] every render while loading. */
const EMPTY_PROJECTS: ProjectListItem[] = [];

const EMPTY_TEAM_CATALOG: TeamMemberCatalogRow[] = [];

const PROJECTS_DISPLAY_DEFAULTS = {
  viewMode: "table" as const,
  tableSize: "normal" as const,
  sortBy: "title" as ProjectsSortColumn,
  sortOrder: "asc" as const,
  pageSize: 25 as const,
  columnVisibility: {
    title: true,
    client: true,
    startDate: true,
    endDate: true,
    tasks: true,
    team: true,
  } satisfies ProjectsColumnVisibility,
  columnOrder: [
    "title",
    "client",
    "tasks",
    "startDate",
    "endDate",
    "team",
  ] as (keyof ProjectsColumnVisibility)[],
};

export function ProjectsListPage() {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();
  useWorkspaceContext();
  const { setCopilotContext } = useCopilotShell();
  const [search, setSearch] = useState("");

  const display = useListDisplayState<
    keyof ProjectsColumnVisibility,
    ProjectsSortColumn
  >({
    storageKey: "projects",
    defaults: PROJECTS_DISPLAY_DEFAULTS,
    validSortColumns: ["title", "start_date", "end_date", "created_at"],
  });

  const {
    sortBy,
    sortOrder,
    viewMode,
    tableSize,
    pageSize,
    columnVisibility,
    columnOrder,
    setSortBy,
    setSortOrder,
  } = display;

  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<ProjectListFilterState>({
    groupBy: "none",
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
  const grouped = filters.groupBy !== "none";

  const params = useMemo(
    () => ({
      page,
      pageSize,
      search: search.trim() || undefined,
      sortBy,
      sortOrder,
      client_id: filters.clientId,
      lead_id: filters.leadId,
    }),
    [
      page,
      pageSize,
      search,
      sortBy,
      sortOrder,
      filters.clientId,
      filters.leadId,
    ]
  );

  const projectsQuery = useProjectsList(params);
  const projects = projectsQuery.data?.data ?? EMPTY_PROJECTS;
  const teamMembersCatalogQuery = useTeamMembersCatalogQuery();
  const teamMembersEnabled = teamMembersCatalogQuery.pluginEnabled;
  const { data: teamCatalogData } = teamMembersCatalogQuery;
  const teamMemberCatalog = teamCatalogData ?? EMPTY_TEAM_CATALOG;
  const memberProfileMap = useMemo(
    () => buildAssigneeProfileMap(teamMemberCatalog),
    [teamMemberCatalog]
  );
  const teamMembersError =
    teamMembersEnabled && teamMembersCatalogQuery.error
      ? teamMembersCatalogQuery.error instanceof Error
        ? teamMembersCatalogQuery.error.message
        : t("detail.members.loadFailed")
      : null;
  const effectiveColumnVisibility = teamMembersEnabled
    ? columnVisibility
    : { ...columnVisibility, team: false };
  const effectiveColumnOrder = teamMembersEnabled
    ? columnOrder
    : columnOrder.filter((key) => key !== "team");
  const showTasksColumn = effectiveColumnVisibility.tasks;
  const projectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects]
  );
  const { isLoading: taskProgressLoading, progressByProjectId } =
    useProjectsListTaskProgress(projectIds, showTasksColumn);
  const total = projectsQuery.data?.total ?? 0;
  const isLoading = projectsQuery.isLoading && !projectsQuery.data;
  const error = projectsQuery.error
    ? projectsQuery.error instanceof Error
      ? projectsQuery.error.message
      : "Failed to load"
    : null;

  const deleteMutation = useDeleteProjectMutation(params);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selection = useTableSelection({ items: projects });
  const { selectedIds, handleSelectAll, handleSelectOne, clearSelection } =
    selection;

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useProjectsModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => (moduleRootCrumb ? [moduleRootCrumb] : []),
    [moduleRootCrumb]
  );
  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("list.addProject")}
        </Button>
        <Button
          className="h-8 w-8 p-0"
          onClick={() => navigate("/mdl/projects/settings")}
          size="sm"
          title={t("menu.settings")}
          variant="outline"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    ),
    [navigate, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  useProjectsListAgentUiSlice({ projects, search });

  useEffect(() => {
    setCopilotContext({
      scope: {
        currentModule: "projects",
      },
    });
    return () => {
      setCopilotContext(null);
    };
  }, [setCopilotContext]);

  const handleSearchChange = useCallback((value: string) => {
    setPage(1);
    setSearch(value);
  }, []);

  const handleFiltersChange = useCallback((next: ProjectListFilterState) => {
    setPage(1);
    setFilters(next);
  }, []);

  const handleSortByChange = useCallback(
    (value: ProjectsSortColumn) => {
      setPage(1);
      display.setSortBy(value);
    },
    [display.setSortBy]
  );

  const handleSortOrderChange = useCallback(
    (value: "asc" | "desc") => {
      setPage(1);
      display.setSortOrder(value);
    },
    [display.setSortOrder]
  );

  const handlePageSizeChange = useCallback(
    (value: typeof pageSize) => {
      setPage(1);
      display.setPageSize(value);
    },
    [display.setPageSize]
  );

  const handleSortChange = useCallback(
    (column: ProjectsSortColumn) => {
      setPage(1);
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [sortBy, sortOrder, setSortBy, setSortOrder]
  );

  const handleCreateSuccess = useCallback(() => {
    setCreateOpen(false);
    void projectsQuery.refetch();
  }, [projectsQuery]);

  const handleDeleteOne = useCallback(
    async ({ deleteTasks }: { deleteTasks: boolean }) => {
      if (!deletingId) {
        return;
      }
      try {
        await deleteMutation.mutateAsync({ id: deletingId, deleteTasks });
      } catch {
        // Error surfaced by mutation
      }
    },
    [deletingId, deleteMutation]
  );

  const handleBulkDelete = useCallback(
    async ({ deleteTasks }: { deleteTasks: boolean }) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) {
        return;
      }
      try {
        await Promise.all(
          ids.map((id) => deleteMutation.mutateAsync({ id, deleteTasks }))
        );
        clearSelection();
      } catch {
        // Error surfaced by mutation
      }
    },
    [selectedIds, clearSelection, deleteMutation]
  );

  const bulkActions = selectedIds.size > 0 && (
    <Button
      className="h-8 gap-1.5"
      disabled={deleteMutation.isPending}
      onClick={() => setBulkDeleteOpen(true)}
      size="sm"
      variant="destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {t("deleteSelected", { count: selectedIds.size })}
    </Button>
  );

  const filterToggleLabel = filtersExpanded
    ? t("filters.hideFilters")
    : t("filters.showFilters");
  const hasActiveChipFilters = hasActiveProjectListChipFilters(filters);
  const hasActiveFilters = hasActiveProjectListFilters(filters);

  const groupedProjects = useMemo(
    () =>
      buildProjectsListGroups(
        projects,
        filters.groupBy,
        t("filters.ungrouped"),
        memberProfileMap,
        t
      ),
    [projects, filters.groupBy, memberProfileMap, t]
  );

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-page"
      data-engenty-region="list"
    >
      <div className="shrink-0 space-y-2">
        <ProjectsTableToolbar
          bulkActions={bulkActions}
          clearSelectionLabel={t("clearSelection")}
          columnOrder={effectiveColumnOrder}
          columnVisibility={effectiveColumnVisibility}
          filtersExpanded={filtersExpanded}
          filterToggleLabel={filterToggleLabel}
          groupBy={filters.groupBy}
          hasActiveChipFilters={hasActiveFilters}
          labels={getProjectsToolbarLabels(t, total, selectedIds.size)}
          onClearSelection={clearSelection}
          onFiltersToggle={() => setFiltersExpanded((open) => !open)}
          onGroupByChange={(groupBy) =>
            handleFiltersChange({ ...filters, groupBy })
          }
          onPageSizeChange={handlePageSizeChange}
          onSearchChange={handleSearchChange}
          onSortByChange={handleSortByChange}
          onSortOrderChange={handleSortOrderChange}
          pageSize={pageSize}
          searchQuery={search}
          selectedCount={selectedIds.size}
          setColumnOrder={display.setColumnOrder}
          setColumnVisibility={display.setColumnVisibility}
          setTableSize={display.setTableSize}
          setViewMode={display.setViewMode}
          showTeamColumn={teamMembersEnabled}
          sortBy={sortBy}
          sortOrder={sortOrder}
          tableSize={tableSize}
          totalCount={total}
          viewMode={viewMode}
        />
        <ProjectListFilterBar
          filtersExpanded={filtersExpanded}
          hasActiveChipFilters={hasActiveChipFilters}
          onChange={handleFiltersChange}
          teamMemberCatalog={teamMemberCatalog}
          value={filters}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {teamMembersError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
            {teamMembersError}
          </div>
        ) : null}
        {isLoading && (
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  {effectiveColumnOrder
                    .filter((k) => effectiveColumnVisibility[k])
                    .map((key) => (
                      <TableHead key={key}>
                        <Skeleton className="h-4 w-20" />
                      </TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map(
                  (rowKey) => (
                    <TableRow key={rowKey}>
                      <TableCell className="w-10">
                        <Skeleton className="h-4 w-4" />
                      </TableCell>
                      {effectiveColumnOrder
                        .filter((k) => effectiveColumnVisibility[k])
                        .map((key) => (
                          <TableCell key={key}>
                            <Skeleton
                              className={
                                key === "title" ? "h-4 w-32" : "h-5 w-24"
                              }
                            />
                          </TableCell>
                        ))}
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && error && (
          <div className="rounded-md border border-red-300/40 bg-red-100/10 p-3 text-red-700 text-sm">
            {error}
          </div>
        )}
        {!(isLoading || error) && projects.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderPlus />
              </EmptyMedia>
              <EmptyTitle>
                {search.trim()
                  ? t("list.noSearchResults")
                  : t("list.noProjects")}
              </EmptyTitle>
              <EmptyDescription>
                {search.trim()
                  ? t("list.noSearchResultsDescription")
                  : t("list.noProjectsDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {search.trim() ? (
                <Button
                  onClick={() => handleSearchChange("")}
                  variant="outline"
                >
                  {t("list.clearSearch")}
                </Button>
              ) : (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("list.addProject")}
                </Button>
              )}
            </EmptyContent>
          </Empty>
        )}

        {!(isLoading || error) &&
          projects.length > 0 &&
          viewMode === "table" && (
            <AdminListTableView
              bottomFade
              pagination={{
                nextLabel: t("list.next"),
                onNext: () => setPage((prev) => Math.min(totalPages, prev + 1)),
                onPrevious: () => setPage((prev) => Math.max(1, prev - 1)),
                page,
                pageOfLabel: t("list.pageOf", { page, totalPages }),
                previousLabel: t("list.previous"),
                totalPages,
              }}
              scrollClassName={grouped ? "rounded-lg" : undefined}
              stickyHeaderShadow
              transparent
            >
              <ProjectsTable
                columnOrder={effectiveColumnOrder}
                columnVisibility={effectiveColumnVisibility}
                grouped={grouped}
                groups={groupedProjects}
                isGroupOpen={isGroupOpen}
                memberProfileMap={memberProfileMap}
                onDataChange={() => void projectsQuery.refetch()}
                onRowClick={(p) => navigate(`/mdl/projects/${p.id}`)}
                onSelectAll={handleSelectAll}
                onSelectOne={handleSelectOne}
                onSortChange={handleSortChange}
                onToggleGroup={toggleGroup}
                progressByProjectId={progressByProjectId}
                selectedIds={selectedIds}
                showTeamMembers={teamMembersEnabled}
                sortBy={sortBy}
                sortOrder={sortOrder}
                tableSize={tableSize}
                taskProgressLoading={taskProgressLoading}
                teamMemberCatalog={teamMemberCatalog}
              />
            </AdminListTableView>
          )}

        {!(isLoading || error) &&
          projects.length > 0 &&
          viewMode === "cards" && (
            <AdminListCardsView bottomFade>
              <div className="flex flex-col gap-2">
                {groupedProjects.map((group) => {
                  const open = grouped ? isGroupOpen(group.key) : true;
                  return (
                    <Fragment key={group.key}>
                      {grouped && group.label ? (
                        <AdminListGroupHeader
                          count={`${group.projects.length}`}
                          onToggle={() => toggleGroup(group.key)}
                          open={open}
                          toggleLabel={t("filters.toggleGroup", {
                            defaultValue: "Toggle group",
                          })}
                        >
                          <AdminListGroupPill>{group.label}</AdminListGroupPill>
                        </AdminListGroupHeader>
                      ) : null}
                      {open ? (
                        <div className={grouped ? "mb-2" : undefined}>
                          <ProjectsCards
                            memberProfileMap={memberProfileMap}
                            onCardClick={(p) =>
                              navigate(`/mdl/projects/${p.id}`)
                            }
                            onDelete={setDeletingId}
                            onSelectOne={handleSelectOne}
                            projects={group.projects}
                            selectedIds={selectedIds}
                            showTeamMembers={teamMembersEnabled}
                            tableSize={tableSize}
                            teamMemberCatalog={teamMemberCatalog}
                          />
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            </AdminListCardsView>
          )}

        {!(isLoading || error) &&
          (projects.length === 0 || viewMode === "cards") && (
            <AdminListPagination
              nextLabel={t("list.next")}
              onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
              page={page}
              pageOfLabel={t("list.pageOf", { page, totalPages })}
              previousLabel={t("list.previous")}
              totalPages={totalPages}
            />
          )}
      </div>

      <ProjectCreateModal
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
        open={createOpen}
      />

      <ProjectsDeleteConfirmDialog
        isDeleting={deleteMutation.isPending}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDeleteOne}
        open={deletingId !== null}
        projectId={deletingId}
      />

      <ProjectsDeleteConfirmDialog
        isDeleting={deleteMutation.isPending}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        open={bulkDeleteOpen}
        selectedCount={selectedIds.size}
      />
    </section>
  );
}
