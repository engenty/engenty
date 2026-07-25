import { requestApiEnvelope } from "@engenty/api-client";
import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AdminListPagination,
  AdminListTableView,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DetailPageHeader,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Tabs,
  useListDisplayState,
  useTableSelection,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { ListTodo, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type {
  Task,
  TasksQueryParams,
  TaskUpdateInput,
} from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { PlanListSubNav } from "../components/plan-list-sub-nav.js";
import { TasksBulkEditDialog } from "../components/tasks-bulk-edit-dialog.js";
import type { TasksSortColumn } from "../components/tasks-display-dialog.js";
import { TasksGroupedList } from "../components/tasks-grouped-list.js";
import { TasksKanbanBoard } from "../components/tasks-kanban-board.js";
import {
  createTasksDisplayDefaults,
  getTasksListColumns,
} from "../components/tasks-list-columns.js";
import {
  getTasksGroupByOptions,
  TasksListFilterBar,
  type TasksListFilterState,
} from "../components/tasks-list-filter-bar.js";
import { TasksListTable } from "../components/tasks-list-table.js";
import {
  type TasksAssigneeKind,
  TasksToolbar,
} from "../components/tasks-toolbar.js";
import { useTasksListAgentUiSlice } from "../hooks/use-tasks-agent-ui-slice.js";
import { useTasksListEnrichments } from "../hooks/use-tasks-list-enrichments.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTasksTopbarActions } from "../hooks/use-tasks-topbar-actions.js";
import { useTeamMembersCatalogQuery } from "../hooks/use-team-catalog-query.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import { getTasksToolbarLabels } from "../lib/tasks-toolbar-labels.js";
import { usePlanListTabNavigation } from "../lib/use-plan-list-tab-navigation.js";
import { buildAssigneeProfileMap, getTasksPluginsApi } from "../plugins.js";
import {
  useBulkDeleteTasksMutation,
  useBulkUpdateTasksMutation,
  useDeleteTaskMutation,
  useGoalsListQuery,
  useTaskSettingsQuery,
  useTasksListQuery,
  useUpdateTasksListMutation,
} from "../tasks-queries.js";

const EMPTY_TASKS: Task[] = [];

export function TasksListPage() {
  const { t } = useTranslation("tasks");
  const { setCopilotContext } = useCopilotShell();
  const navigate = useNavigate();
  const onPlanTabChange = usePlanListTabNavigation();

  const displayDefaults = useMemo(() => createTasksDisplayDefaults(), []);
  const allListColumns = useMemo(() => getTasksListColumns(), []);

  const display = useListDisplayState<string, TasksSortColumn>({
    storageKey: "tasks-list",
    defaults: displayDefaults,
    validSortColumns: [
      "updated_at",
      "created_at",
      "title",
      "status",
      "identifier",
    ],
    validViewModes: ["table", "kanban", "cards"],
  });
  const {
    viewMode,
    tableSize,
    columnVisibility,
    columnOrder,
    sortBy,
    sortOrder,
    setViewMode,
    setTableSize,
    setColumnVisibility,
    setColumnOrder,
    setSortBy,
    setSortOrder,
  } = display;

  const [search, setSearch] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<TasksListFilterState>({
    groupBy: "status",
    status: "all",
    assignee: "all",
    priority: "all",
    goalId: "all",
  });
  const [page, setPage] = useState(1);
  const [assigneeKind, setAssigneeKind] = useState<TasksAssigneeKind>("");

  const { openCreateTask, pageActions, topbarDialogs } =
    useTasksTopbarActions();

  const pageSize = viewMode === "kanban" || viewMode === "cards" ? 200 : 25;

  const listParams = useMemo<TasksQueryParams>(
    () => ({
      page,
      pageSize,
      search: search.trim() || undefined,
      status: filters.status === "all" ? undefined : filters.status,
      assigned_to:
        filters.assignee === "all" || filters.assignee === "unassigned"
          ? undefined
          : filters.assignee,
      assignee_kind: assigneeKind || undefined,
      goal_id: filters.goalId === "all" ? undefined : filters.goalId,
      sortBy,
      sortOrder,
    }),
    [
      page,
      pageSize,
      search,
      filters.status,
      filters.assignee,
      assigneeKind,
      filters.goalId,
      sortBy,
      sortOrder,
    ]
  );

  const tasksQuery = useTasksListQuery(listParams);
  const goalsQuery = useGoalsListQuery({
    page: 1,
    pageSize: 200,
    sortBy: "title",
    sortOrder: "asc",
  });
  const settingsQuery = useTaskSettingsQuery();
  const teamMembersCatalogQuery = useTeamMembersCatalogQuery();
  const taskStatusDefinitions =
    settingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;
  const deleteMutation = useDeleteTaskMutation();
  const updateListMutation = useUpdateTasksListMutation(listParams);

  const tasks = tasksQuery.data?.data ?? EMPTY_TASKS;
  const goals = goalsQuery.data?.data ?? [];
  const total = tasksQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isLoading = tasksQuery.isLoading && !tasksQuery.data;
  const error = tasksQuery.error
    ? tasksQuery.error instanceof Error
      ? tasksQuery.error.message
      : t("list.loadFailed")
    : null;

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filters.priority !== "all") {
      result = result.filter((t) => t.priority === filters.priority);
    }
    if (filters.assignee === "unassigned") {
      result = result.filter((t) => t.primary_assignee_kind === "none");
    }
    return result;
  }, [tasks, filters.priority, filters.assignee]);

  const enrichments = useTasksListEnrichments(filteredTasks);

  const selection = useTableSelection({ items: filteredTasks });
  const { selectedIds, handleSelectAll, handleSelectOne, clearSelection } =
    selection;

  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const bulkUpdateMutation = useBulkUpdateTasksMutation();
  const bulkDeleteMutation = useBulkDeleteTasksMutation();

  const handleBulkEditSubmit = useCallback(
    async (input: TaskUpdateInput) => {
      const taskIds = Array.from(selectedIds);
      if (taskIds.length === 0) {
        return;
      }

      try {
        await bulkUpdateMutation.mutateAsync({ taskIds, input });
        toast.success(t("list.bulkUpdateSuccess"));
        clearSelection();
      } catch {
        toast.error(t("list.bulkUpdateFailed"));
      }
    },
    [selectedIds, bulkUpdateMutation, clearSelection, t]
  );

  const handleBulkDelete = useCallback(async () => {
    const taskIds = Array.from(selectedIds);
    if (taskIds.length === 0) {
      return;
    }

    try {
      await bulkDeleteMutation.mutateAsync(taskIds);
      toast.success(t("list.bulkDeleteSuccess"));
      clearSelection();
      setBulkDeleteOpen(false);
    } catch {
      toast.error(t("list.bulkDeleteFailed"));
    }
  }, [selectedIds, bulkDeleteMutation, clearSelection, t]);

  const bulkActions = selectedIds.size > 0 && (
    <>
      <Button
        className="gap-1.5"
        onClick={() => setBulkEditOpen(true)}
        size="sm"
        variant="outline"
      >
        <Pencil className="h-3.5 w-3.5" />
        {t("list.editSelected", { count: selectedIds.size })}
      </Button>
      <Button
        className="gap-1.5 text-destructive hover:text-destructive"
        onClick={() => setBulkDeleteOpen(true)}
        size="sm"
        variant="outline"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {t("list.deleteSelected")}
      </Button>
    </>
  );

  const teamMembersEnabled = teamMembersCatalogQuery.pluginEnabled;
  const projectsEnabled =
    getTasksPluginsApi()?.isPluginEnabled("projects") ?? false;
  const projectsCatalogQuery = useQuery({
    queryKey: ["projects", "list-minimal"],
    queryFn: async ({ signal }) => {
      const response = await requestApiEnvelope<
        Array<{ id: string; title: string }>
      >("/api/projects?pageSize=200&sortBy=title&sortOrder=asc", {
        method: "GET",
        signal,
      });
      return response.data;
    },
    enabled:
      projectsEnabled &&
      (filters.groupBy === "project" || columnVisibility.project === true),
    staleTime: 60_000,
  });
  const projectTitleById = useMemo(
    () =>
      new Map((projectsCatalogQuery.data ?? []).map((p) => [p.id, p.title])),
    [projectsCatalogQuery.data]
  );
  const assigneeProfiles = useMemo(
    () => buildAssigneeProfileMap(teamMembersCatalogQuery.data ?? []),
    [teamMembersCatalogQuery.data]
  );
  const listColumns = useMemo(
    () =>
      projectsEnabled
        ? allListColumns
        : allListColumns.filter((column) => column.key !== "project"),
    [allListColumns, projectsEnabled]
  );
  const effectiveColumnVisibility = teamMembersEnabled
    ? columnVisibility
    : { ...columnVisibility, assignee: false };
  const effectiveColumnOrder = teamMembersEnabled
    ? columnOrder
    : columnOrder.filter((key) => key !== "assignee");

  const labels = useMemo(
    () => getTasksToolbarLabels(t, total, selectedIds.size),
    [t, total, selectedIds.size]
  );

  const columnOptions = useMemo(
    () =>
      listColumns.map((column) => ({
        key: column.key,
        label: column.labelKey
          ? t(column.labelKey.replace(/^tasks:/, ""))
          : column.label,
        icon: column.icon,
      })),
    [listColumns, t]
  );

  const sortOptions = useMemo(
    () =>
      [
        { value: "updated_at", label: labels.sortByUpdatedAt },
        { value: "created_at", label: labels.sortByCreatedAt },
        { value: "title", label: labels.sortByTitle },
        { value: "status", label: labels.sortByStatus },
        { value: "identifier", label: labels.sortByIdentifier },
      ] as const,
    [labels]
  );

  useEffect(() => {
    setPage(1);
  }, [search, filters, sortBy, sortOrder, viewMode, assigneeKind]);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("sidebar.tasks") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white header so the two blend.
    topbarOverlap: true,
  });

  useTasksListAgentUiSlice({ search, tasks });

  useEffect(() => {
    setCopilotContext({
      scope: {
        current_module: "tasks",
        currentModule: "tasks",
        routeKey: "list",
      },
    });
    return () => setCopilotContext(null);
  }, [setCopilotContext]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleFiltersChange = useCallback((next: TasksListFilterState) => {
    setFilters(next);
  }, []);

  const handleTaskClick = useCallback(
    (task: Task) => {
      navigate(tasksPaths.taskDetail(task.id));
    },
    [navigate]
  );

  const handleTaskEdit = useCallback(
    (task: Task) => {
      navigate(tasksPaths.taskDetail(task.id));
    },
    [navigate]
  );

  const handleTaskDelete = useCallback(
    async (taskId: string) => {
      try {
        await deleteMutation.mutateAsync(taskId);
      } catch {
        toast.error(t("list.deleteFailed"));
      }
    },
    [deleteMutation, t]
  );

  const handleAddTask = useCallback(
    (goalId?: string | null) => {
      openCreateTask(goalId);
    },
    [openCreateTask]
  );

  const handleTaskStatusChange = useCallback(
    async (taskId: string, status: string) => {
      try {
        await updateListMutation.mutateAsync({
          taskId,
          input: { status },
        });
      } catch {
        toast.error(t("list.statusUpdateFailed"));
      }
    },
    [t, updateListMutation]
  );

  const handleGoalEdit = useCallback(
    (goalId: string) => {
      navigate(tasksPaths.goalDetail(goalId));
    },
    [navigate]
  );

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.assignee !== "all" ||
    filters.priority !== "all" ||
    filters.goalId !== "all" ||
    assigneeKind !== "";

  const assigneeOptions = useMemo(
    () =>
      (teamMembersCatalogQuery.data ?? []).map((m) => ({
        id: m.user_id ?? m.id,
        name: m.full_name,
      })),
    [teamMembersCatalogQuery.data]
  );

  const groupByOptions = useMemo(
    () => getTasksGroupByOptions(t, projectsEnabled),
    [projectsEnabled, t]
  );

  const showGroupedEmpty =
    viewMode === "cards" &&
    !(isLoading || error) &&
    filteredTasks.length === 0 &&
    goals.length === 0 &&
    !search.trim() &&
    !hasActiveFilters;

  const showGroupedNoResults =
    viewMode === "cards" &&
    !(isLoading || error) &&
    filteredTasks.length === 0 &&
    (goals.length > 0 || tasks.length > 0) &&
    (search.trim() || hasActiveFilters);

  return (
    <Tabs
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      data-engenty-region="list"
      onValueChange={onPlanTabChange}
      value="tasks"
    >
      <DetailPageHeader
        aboveStrip={<PlanListSubNav />}
        aboveStripAlign="center"
        description={<p>{t("list.description")}</p>}
        maxWidth="5xl"
        title={t("list.title")}
        variant="canvas"
      />

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6 px-page pb-10">
          <div className="shrink-0 space-y-2">
            <TasksToolbar
              assigneeKind={assigneeKind}
              bulkActions={bulkActions}
              clearSelectionLabel={t("list.clearSelection")}
              columnOrder={effectiveColumnOrder}
              columns={[...columnOptions]}
              columnVisibility={effectiveColumnVisibility}
              filtersExpanded={filtersExpanded}
              groupBy={filters.groupBy}
              groupByOptions={groupByOptions}
              hasActiveFilters={hasActiveFilters}
              labels={labels}
              onAssigneeKindChange={setAssigneeKind}
              onClearSelection={clearSelection}
              onFiltersToggle={() => setFiltersExpanded((prev) => !prev)}
              onGroupByChange={(groupBy) =>
                setFilters((current) => ({ ...current, groupBy }))
              }
              onSearchChange={handleSearchChange}
              searchQuery={search}
              selectedCount={selectedIds.size}
              setColumnOrder={setColumnOrder}
              setColumnVisibility={setColumnVisibility}
              setSortBy={setSortBy}
              setSortOrder={setSortOrder}
              setTableSize={setTableSize}
              setViewMode={setViewMode}
              sortBy={sortBy}
              sortOptions={[...sortOptions]}
              sortOrder={sortOrder}
              tableSize={tableSize}
              viewMode={viewMode}
            />
            <TasksListFilterBar
              assigneeOptions={assigneeOptions}
              filtersExpanded={filtersExpanded}
              goalOptions={goals}
              hasActiveChipFilters={hasActiveFilters}
              onChange={handleFiltersChange}
              statusOptions={taskStatusDefinitions}
              value={filters}
            />
          </div>

          {isLoading ? (
            <p className="text-muted-foreground text-sm">…</p>
          ) : null}

          {!isLoading && error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
              {error}
            </div>
          ) : null}

          {!(isLoading || error) &&
          filteredTasks.length === 0 &&
          viewMode !== "cards" ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListTodo className="h-12 w-12" />
                </EmptyMedia>
                <EmptyTitle>
                  {search.trim() || hasActiveFilters
                    ? t("list.noSearchResults")
                    : t("list.empty")}
                </EmptyTitle>
                <EmptyDescription>
                  {t("list.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {search.trim() || hasActiveFilters ? (
                  <button
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
                    onClick={() => {
                      setSearch("");
                      setFilters({
                        groupBy: filters.groupBy,
                        status: "all",
                        assignee: "all",
                        priority: "all",
                        goalId: "all",
                      });
                    }}
                    type="button"
                  >
                    {t("list.clearSearch")}
                  </button>
                ) : (
                  <button
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
                    onClick={() => handleAddTask(null)}
                    type="button"
                  >
                    {t("list.newTask")}
                  </button>
                )}
              </EmptyContent>
            </Empty>
          ) : null}

          {!(isLoading || error) &&
            filteredTasks.length > 0 &&
            viewMode === "table" && (
              <AdminListTableView
                bottomFade
                pagination={{
                  nextLabel: t("list.next"),
                  onNext: () =>
                    setPage((prev) => Math.min(totalPages, prev + 1)),
                  onPrevious: () => setPage((prev) => Math.max(1, prev - 1)),
                  page,
                  pageOfLabel: t("list.pageOf", { page, totalPages }),
                  previousLabel: t("list.previous"),
                  totalPages,
                }}
                scrollClassName={
                  filters.groupBy === "none" ? undefined : "rounded-lg"
                }
                stickyHeaderShadow
                transparent={filters.groupBy !== "none"}
              >
                <TasksListTable
                  assigneeProfiles={assigneeProfiles}
                  columnOrder={effectiveColumnOrder}
                  columns={listColumns}
                  columnVisibility={effectiveColumnVisibility}
                  enrichments={enrichments}
                  goals={goals}
                  groupBy={filters.groupBy}
                  navigate={navigate}
                  onDelete={handleTaskDelete}
                  onEdit={handleTaskEdit}
                  onRowClick={handleTaskClick}
                  onSelectAll={handleSelectAll}
                  onSelectOne={handleSelectOne}
                  projectTitleById={projectTitleById}
                  selectedIds={selectedIds}
                  showAssignee={teamMembersEnabled}
                  tableSize={tableSize ?? "normal"}
                  taskStatusDefinitions={taskStatusDefinitions}
                  tasks={filteredTasks}
                />
              </AdminListTableView>
            )}

          {!(isLoading || error) &&
            filteredTasks.length > 0 &&
            viewMode === "kanban" && (
              <div className="min-h-0 min-w-0 flex-1 overflow-auto">
                <TasksKanbanBoard
                  assigneeProfiles={assigneeProfiles}
                  listParams={listParams}
                  onTaskClick={handleTaskClick}
                  onTaskDelete={handleTaskDelete}
                  onTaskEdit={handleTaskEdit}
                  showAssignee={teamMembersEnabled}
                  statusColumns={taskStatusDefinitions}
                  tasks={filteredTasks}
                />
              </div>
            )}

          {!(isLoading || error) &&
          viewMode === "cards" &&
          filteredTasks.length > 0 ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              <TasksGroupedList
                assigneeProfiles={assigneeProfiles}
                goals={goals}
                groupBy={filters.groupBy}
                onAddGeneralTask={() => handleAddTask(null)}
                onAddTaskToGoal={(goalId) => handleAddTask(goalId)}
                onGoalEdit={handleGoalEdit}
                onTaskClick={handleTaskClick}
                onTaskDelete={handleTaskDelete}
                onTaskEdit={handleTaskEdit}
                onTaskStatusChange={handleTaskStatusChange}
                projectTitleById={projectTitleById}
                showAssignee={teamMembersEnabled}
                taskStatusDefinitions={taskStatusDefinitions}
                tasks={filteredTasks}
              />
            </div>
          ) : null}

          {showGroupedEmpty || showGroupedNoResults ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListTodo className="h-12 w-12" />
                </EmptyMedia>
                <EmptyTitle>
                  {search.trim() || hasActiveFilters
                    ? t("list.noSearchResults")
                    : t("list.empty")}
                </EmptyTitle>
                <EmptyDescription>
                  {t("list.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {search.trim() || hasActiveFilters ? (
                  <button
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
                    onClick={() => {
                      setSearch("");
                      setFilters({
                        groupBy: filters.groupBy,
                        status: "all",
                        assignee: "all",
                        priority: "all",
                        goalId: "all",
                      });
                    }}
                    type="button"
                  >
                    {t("list.clearSearch")}
                  </button>
                ) : (
                  <button
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
                    onClick={() => handleAddTask(null)}
                    type="button"
                  >
                    {t("list.newTask")}
                  </button>
                )}
              </EmptyContent>
            </Empty>
          ) : null}

          {!(isLoading || error) &&
          filteredTasks.length > 0 &&
          viewMode === "cards" ? (
            <AdminListPagination
              nextLabel={t("list.next")}
              onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
              page={page}
              pageOfLabel={t("list.pageOf", { page, totalPages })}
              previousLabel={t("list.previous")}
              totalPages={totalPages}
            />
          ) : null}

          {topbarDialogs}

          <TasksBulkEditDialog
            goals={goals}
            onClose={() => setBulkEditOpen(false)}
            onSubmit={handleBulkEditSubmit}
            open={bulkEditOpen}
            selectedCount={selectedIds.size}
            taskStatusDefinitions={taskStatusDefinitions}
            teamMembersCatalog={teamMembersCatalogQuery.data ?? []}
            teamMembersEnabled={teamMembersEnabled}
            teamMembersLoading={teamMembersCatalogQuery.isLoading}
          />

          <AlertDialog onOpenChange={setBulkDeleteOpen} open={bulkDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("list.bulkDeleteConfirmTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("list.bulkDeleteConfirmDescription", {
                    count: selectedIds.size,
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>
                  {t("list.bulkDeleteCancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={bulkDeleteMutation.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    void handleBulkDelete();
                  }}
                >
                  {t("list.bulkDeleteAction")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Tabs>
  );
}
