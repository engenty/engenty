import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListTableView,
  DetailPageHeader,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  useListDisplayState,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Target } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  Goal,
  GoalStatus,
  GoalsQueryParams,
} from "../../src/schema/types.js";
import { GoalsCards } from "../components/goals-cards.js";
import type {
  GoalsColumnVisibility,
  GoalsSortColumn,
  GoalsViewMode,
} from "../components/goals-display-dialog.js";
import { GoalsListTable } from "../components/goals-list-table.js";
import {
  type GoalsOwnerKind,
  GoalsToolbar,
} from "../components/goals-toolbar.js";
import { useTasksGoalsListAgentUiSlice } from "../hooks/use-tasks-agent-ui-slice.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTasksTopbarActions } from "../hooks/use-tasks-topbar-actions.js";
import { getGoalsToolbarLabels } from "../lib/goals-toolbar-labels.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import { useDeleteGoalMutation, useGoalsListQuery } from "../tasks-queries.js";

const EMPTY_GOALS: Goal[] = [];

const GOALS_DISPLAY_DEFAULTS = {
  viewMode: "cards" as const,
  tableSize: "normal" as const,
  sortBy: "updated_at" as GoalsSortColumn,
  sortOrder: "desc" as const,
  columnVisibility: {
    title: true,
    status: true,
    tasks: true,
    targetDate: false,
    updatedAt: false,
  } satisfies GoalsColumnVisibility,
  columnOrder: [
    "title",
    "status",
    "tasks",
    "targetDate",
    "updatedAt",
  ] as (keyof GoalsColumnVisibility)[],
};

export function GoalsListPage() {
  const { t } = useTranslation("tasks");
  const { setCopilotContext } = useCopilotShell();
  const navigate = useNavigate();

  const display = useListDisplayState<
    keyof GoalsColumnVisibility,
    GoalsSortColumn
  >({
    storageKey: "tasks-goals",
    defaults: GOALS_DISPLAY_DEFAULTS,
    validSortColumns: ["updated_at", "created_at", "title", "status"],
    validViewModes: ["cards", "table"],
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
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "all">("all");
  const [ownerKind, setOwnerKind] = useState<GoalsOwnerKind>("");
  const [page, setPage] = useState(1);

  const { openCreateGoal, pageActions, topbarDialogs } =
    useTasksTopbarActions();

  const pageSize = viewMode === "cards" ? 200 : 25;

  const listParams = useMemo<GoalsQueryParams>(
    () => ({
      page,
      pageSize,
      search: search.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      owner_kind: ownerKind || undefined,
      sortBy,
      sortOrder,
    }),
    [page, pageSize, search, statusFilter, ownerKind, sortBy, sortOrder]
  );

  const listQuery = useGoalsListQuery(listParams);
  const deleteMutation = useDeleteGoalMutation();

  const goals = listQuery.data?.data ?? EMPTY_GOALS;
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isLoading = listQuery.isLoading && !listQuery.data;
  const error = listQuery.error
    ? listQuery.error instanceof Error
      ? listQuery.error.message
      : t("goals.loadFailed")
    : null;

  const labels = useMemo(() => getGoalsToolbarLabels(t, total), [t, total]);

  const columnOptions = useMemo(
    () =>
      [
        { key: "title", label: labels.title },
        { key: "status", label: labels.status },
        { key: "tasks", label: labels.tasks },
        { key: "targetDate", label: labels.targetDate },
        { key: "updatedAt", label: labels.updatedAt },
      ] as const,
    [labels]
  );

  const sortOptions = useMemo(
    () =>
      [
        { value: "updated_at", label: labels.sortByUpdatedAt },
        { value: "created_at", label: labels.sortByCreatedAt },
        { value: "title", label: labels.sortByTitle },
        { value: "status", label: labels.sortByStatus },
      ] as const,
    [labels]
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, ownerKind, sortBy, sortOrder]);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("sidebar.goals") },
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

  useTasksGoalsListAgentUiSlice({ goals, search });

  useEffect(() => {
    setCopilotContext({
      scope: {
        current_module: "tasks",
        currentModule: "tasks",
        routeKey: "goals",
      },
    });
    return () => setCopilotContext(null);
  }, [setCopilotContext]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleStatusFilterChange = useCallback((value: GoalStatus | "all") => {
    setStatusFilter(value);
  }, []);

  const handleRowClick = useCallback(
    (goal: Goal) => {
      navigate(tasksPaths.goalDetail(goal.id));
    },
    [navigate]
  );

  const handleEdit = useCallback(
    (goal: Goal) => {
      navigate(tasksPaths.goalDetail(goal.id));
    },
    [navigate]
  );

  const handleDelete = useCallback(
    async (goalId: string) => {
      await deleteMutation.mutateAsync(goalId);
    },
    [deleteMutation]
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <DetailPageHeader
        description={<p>{t("goals.description")}</p>}
        maxWidth="5xl"
        title={t("goals.title")}
        variant="canvas"
      />

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 px-page pb-10">
          <GoalsToolbar
            columnOrder={columnOrder}
            columns={[...columnOptions]}
            columnVisibility={columnVisibility}
            labels={labels}
            onOwnerKindChange={setOwnerKind}
            onSearchChange={handleSearchChange}
            onStatusFilterChange={handleStatusFilterChange}
            ownerKind={ownerKind}
            searchQuery={search}
            setColumnOrder={setColumnOrder}
            setColumnVisibility={setColumnVisibility}
            setSortBy={setSortBy}
            setSortOrder={setSortOrder}
            setTableSize={setTableSize}
            setViewMode={setViewMode}
            sortBy={sortBy}
            sortOptions={[...sortOptions]}
            sortOrder={sortOrder}
            statusFilter={statusFilter}
            tableSize={tableSize}
            viewMode={viewMode as GoalsViewMode}
          />

          {isLoading ? (
            <p className="text-muted-foreground text-sm">…</p>
          ) : null}

          {!isLoading && error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
              {error}
            </div>
          ) : null}

          {!(isLoading || error) && goals.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Target className="h-12 w-12" />
                </EmptyMedia>
                <EmptyTitle>
                  {search.trim() || statusFilter !== "all" || ownerKind !== ""
                    ? t("goals.noSearchResults")
                    : t("goals.empty")}
                </EmptyTitle>
                <EmptyDescription>
                  {t("goals.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {search.trim() || statusFilter !== "all" || ownerKind !== "" ? (
                  <button
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
                    onClick={() => {
                      handleSearchChange("");
                      handleStatusFilterChange("all");
                      setOwnerKind("");
                    }}
                    type="button"
                  >
                    {t("goals.clearFilters")}
                  </button>
                ) : (
                  <button
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
                    onClick={() => openCreateGoal()}
                    type="button"
                  >
                    {t("goals.newGoal")}
                  </button>
                )}
              </EmptyContent>
            </Empty>
          ) : null}

          {!(isLoading || error) && goals.length > 0 && viewMode === "cards" ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              <GoalsCards goals={goals} onGoalClick={handleRowClick} />
            </div>
          ) : null}

          {!(isLoading || error) && goals.length > 0 && viewMode === "table" ? (
            <AdminListTableView
              pagination={{
                nextLabel: t("goals.next"),
                onNext: () => setPage((prev) => Math.min(totalPages, prev + 1)),
                onPrevious: () => setPage((prev) => Math.max(1, prev - 1)),
                page,
                pageOfLabel: t("goals.pageOf", { page, totalPages }),
                previousLabel: t("goals.previous"),
                totalPages,
              }}
            >
              <GoalsListTable
                columnOrder={columnOrder}
                columnVisibility={columnVisibility}
                goals={goals}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onRowClick={handleRowClick}
                tableSize={tableSize ?? "normal"}
              />
            </AdminListTableView>
          ) : null}

          {topbarDialogs}
        </div>
      </div>
    </div>
  );
}
