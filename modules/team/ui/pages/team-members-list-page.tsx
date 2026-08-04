import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
import {
  AdminListCardsView,
  AdminListGroupHeader,
  AdminListGroupPill,
  AdminListPagination,
  AdminListTableView,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { Plus, Trash2, Upload, Users } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";
import { Fragment, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TeamMemberListItem } from "../api.js";
import { TeamListFilterBar } from "../components/team-list-filter-bar.js";
import {
  hasActiveTeamListChipFilters,
  hasActiveTeamListFilters,
  type TeamListFilterState,
} from "../components/team-list-filters.js";
import { TeamMemberCreateModal } from "../components/team-member-create-modal.js";
import { TeamMembersCards } from "../components/team-members-cards.js";
import {
  type TeamMembersColumnVisibility,
  type TeamMembersSortColumn,
  TeamMembersTableToolbar,
} from "../components/team-members-display-dialog.js";
import { TeamMembersExportMenu } from "../components/team-members-export-menu.js";
import { TeamMembersOverflowMenu } from "../components/team-members-overflow-menu.js";
import { TeamMembersTable } from "../components/team-members-table.js";
import { useTeamMembersListAgentUiSlice } from "../hooks/use-team-agent-ui-slice.js";
import { useTeamModuleSecondaryShellNav } from "../hooks/use-team-module-secondary-shell-nav.js";
import { TEAM_MEMBERS_LIST_DISPLAY_DEFAULTS } from "../lib/team-members-list-display.js";
import { buildTeamMembersListGroups } from "../lib/team-members-list-grouping.js";
import { getTeamMembersToolbarLabels } from "../lib/team-members-toolbar-labels.js";
import { teamModulePageListShellSectionClassName } from "../lib/team-page-shell.js";
import {
  teamMemberKeys,
  useDeleteTeamMemberMutation,
  useTeamMembersListQuery,
} from "../queries.js";
import { teamFilterOptionsQueryOptions } from "../team-module-queries.js";
import { TEAM_IMPORT_PATH, teamMemberDetailPath } from "../team-paths.js";

export function TeamMembersListPage() {
  const { t } = useTranslation("team");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useWorkspaceContext();
  const shellNav = useTeamModuleSecondaryShellNav();
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [groupBy, setGroupBy] = useQueryState(
    "groupBy",
    parseAsStringLiteral([
      "none",
      "department",
      "role",
      "location",
    ] as const).withDefault("none")
  );
  const [roleTermId, setRoleTermId] = useQueryState("role", parseAsString);
  const [locationTermId, setLocationTermId] = useQueryState(
    "location",
    parseAsString
  );
  const [groupId, setGroupId] = useQueryState("group", parseAsString);

  const filters: TeamListFilterState = {
    groupBy,
    roleTermId: roleTermId ?? undefined,
    locationTermId: locationTermId ?? undefined,
    groupId: groupId ?? undefined,
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
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
  const grouped = groupBy !== "none";
  const display = useListDisplayState<
    keyof TeamMembersColumnVisibility,
    TeamMembersSortColumn
  >({
    storageKey: "team",
    defaults: TEAM_MEMBERS_LIST_DISPLAY_DEFAULTS,
    validSortColumns: ["full_name", "position", "department", "created_at"],
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

  const listParams = {
    page,
    pageSize,
    search: search.trim() || undefined,
    sortBy,
    sortOrder,
    role_term_id: filters.roleTermId,
    location_term_id: filters.locationTermId,
    group_id: filters.groupId,
  };
  const exportListParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      sortBy,
      sortOrder,
      role_term_id: filters.roleTermId,
      location_term_id: filters.locationTermId,
      group_id: filters.groupId,
    }),
    [
      filters.groupId,
      filters.locationTermId,
      filters.roleTermId,
      search,
      sortBy,
      sortOrder,
    ]
  );
  const listQuery = useTeamMembersListQuery(listParams);
  const deleteMutation = useDeleteTeamMemberMutation(listParams);
  const members = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  useTeamMembersListAgentUiSlice({ members, search, total });
  const isLoading = listQuery.isLoading;
  const error =
    listQuery.error == null
      ? null
      : listQuery.error instanceof Error
        ? listQuery.error.message
        : t("loadFailed");

  const selection = useTableSelection({ items: members });
  const { selectedIds, handleSelectAll, handleSelectOne, clearSelection } =
    selection;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const breadcrumbs = useMemo(
    () => (shellNav.moduleRootCrumb ? [shellNav.moduleRootCrumb] : []),
    [shellNav.moduleRootCrumb]
  );

  const handleFiltersChange = useCallback(
    (next: TeamListFilterState) => {
      void setPage(1);
      void setGroupBy(next.groupBy);
      void setRoleTermId(next.roleTermId ?? null);
      void setLocationTermId(next.locationTermId ?? null);
      void setGroupId(next.groupId ?? null);
    },
    [setPage, setGroupBy, setRoleTermId, setLocationTermId, setGroupId]
  );

  const filterToggleLabel = filtersExpanded
    ? t("filters.hideFilters")
    : t("filters.showFilters");
  const hasActiveChipFilters = hasActiveTeamListChipFilters(filters);
  const hasActiveFilters = hasActiveTeamListFilters(filters);

  const filterOptionsQuery = useQuery(teamFilterOptionsQueryOptions());
  const filterOptions = filterOptionsQuery.data ?? [];

  const groupedMembers = useMemo(() => {
    // Build ordered label list from the relevant taxonomy so groups respect sort_order.
    let termOrder: string[] | undefined;
    if (filters.groupBy === "role") {
      const tax = filterOptions.find((fo) => fo.taxonomy.builtin === "role");
      termOrder = (tax?.terms ?? []).map((term) => term.label);
    } else if (filters.groupBy === "location") {
      const tax = filterOptions.find(
        (fo) => fo.taxonomy.builtin === "location"
      );
      termOrder = (tax?.terms ?? []).map((term) => term.label);
    }
    return buildTeamMembersListGroups(
      members,
      filters.groupBy,
      t("filters.ungrouped"),
      termOrder
    );
  }, [filters.groupBy, members, t, filterOptions]);

  const handleSearchChange = useCallback(
    (value: string) => {
      void setPage(1);
      void setSearch(value);
    },
    [setPage, setSearch]
  );

  const handleSortByChange = useCallback(
    (value: TeamMembersSortColumn) => {
      void setPage(1);
      display.setSortBy(value);
    },
    [setPage, display.setSortBy]
  );

  const handleSortOrderChange = useCallback(
    (value: "asc" | "desc") => {
      void setPage(1);
      display.setSortOrder(value);
    },
    [setPage, display.setSortOrder]
  );

  const handlePageSizeChange = useCallback(
    (value: typeof pageSize) => {
      void setPage(1);
      display.setPageSize(value);
    },
    [setPage, display.setPageSize]
  );

  const handleSortChange = useCallback(
    (column: TeamMembersSortColumn) => {
      void setPage(1);
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [setPage, sortBy, sortOrder, setSortBy, setSortOrder]
  );

  const handleCreateSuccess = useCallback(
    (created: TeamMemberListItem) => {
      setCreateOpen(false);
      queryClient.setQueryData(teamMemberKeys.detailPage(created.id), {
        member: created,
      });
      void queryClient.invalidateQueries({ queryKey: teamMemberKeys.all });
      navigate(teamMemberDetailPath(created.id));
    },
    [navigate, queryClient]
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)));
      clearSelection();
      void listQuery.refetch();
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, clearSelection, deleteMutation, listQuery]);

  const bulkActions = selectedIds.size > 0 && (
    <Button
      className="gap-1.5"
      disabled={bulkDeleting}
      onClick={() => {
        handleBulkDelete();
      }}
      size="sm"
      variant="destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {t("deleteSelected", { count: selectedIds.size })}
    </Button>
  );

  const exportMenu = useMemo(
    () => (
      <TeamMembersExportMenu
        baseName={`team-members-${new Date().toISOString().slice(0, 10)}`}
        columnOrder={columnOrder}
        columnVisibility={columnVisibility}
        exportColumnLabels={{
          avatar: t("avatar"),
          linkedUser: t("linkedUser"),
          fullName: t("fullName"),
          position: t("position"),
          department: t("department"),
          location: t("location"),
          phone: t("phone"),
          reportsTo: t("reportsTo"),
          email: t("email"),
          role: t("profileRole"),
          memberType: t("memberType"),
          createdAt: t("sortByCreatedAt"),
        }}
        exportCsvLabel={t("exportCsv")}
        exportFailedLabel={t("exportFailed")}
        exportLabel={t("export")}
        exportPrintLabel={t("exportPrint")}
        exportXlsLabel={t("exportXls")}
        listParams={exportListParams}
      />
    ),
    [columnOrder, columnVisibility, exportListParams, t]
  );

  const overflowMenu = useMemo(
    () => (
      <TeamMembersOverflowMenu
        importLabel={t("import.label")}
        menuMoreLabel={t("menuMore")}
        settingsLabel={t("moduleSettings")}
      />
    ),
    [t]
  );

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {exportMenu}
        {overflowMenu}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("addMember")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("addMember")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(TEAM_IMPORT_PATH)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("import.label")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [exportMenu, navigate, overflowMenu, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  return (
    <section className={teamModulePageListShellSectionClassName}>
      <div className="shrink-0 space-y-2">
        <TeamMembersTableToolbar
          bulkActions={bulkActions}
          clearSelectionLabel={t("clearSelection")}
          columnOrder={columnOrder}
          columnVisibility={columnVisibility}
          filtersExpanded={filtersExpanded}
          filterToggleLabel={filterToggleLabel}
          groupBy={filters.groupBy}
          hasActiveChipFilters={hasActiveFilters}
          labels={getTeamMembersToolbarLabels(t, total, selectedIds.size)}
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
          sortBy={sortBy}
          sortOrder={sortOrder}
          tableSize={tableSize}
          totalCount={total}
          viewMode={viewMode}
        />
        <TeamListFilterBar
          filtersExpanded={filtersExpanded}
          hasActiveChipFilters={hasActiveChipFilters}
          onChange={handleFiltersChange}
          value={filters}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {isLoading && (
          <AdminListTableView>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  {columnOrder
                    .filter((k) => columnVisibility[k])
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
                      {columnOrder
                        .filter((k) => columnVisibility[k])
                        .map((key) => (
                          <TableCell key={key}>
                            <Skeleton
                              className={
                                key === "avatar"
                                  ? tableSize === "compact"
                                    ? "h-6 w-6 rounded-full"
                                    : "h-7 w-7 rounded-full"
                                  : key === "fullName"
                                    ? "h-4 w-32"
                                    : "h-5 w-24"
                              }
                            />
                          </TableCell>
                        ))}
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </AdminListTableView>
        )}
        {!isLoading && error && (
          <AdminListTableView>
            <div className="p-4 text-red-700 text-sm dark:text-red-300">
              {error}
            </div>
          </AdminListTableView>
        )}
        {!(isLoading || error) && members.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>{t("noMembers")}</EmptyTitle>
              <EmptyDescription>{t("noMembersDescription")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("addMember")}
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {!(isLoading || error) &&
          members.length > 0 &&
          viewMode === "table" && (
            <AdminListTableView
              bottomFade
              pagination={{
                nextLabel: t("next"),
                onNext: () => void setPage((p) => Math.min(totalPages, p + 1)),
                onPrevious: () => void setPage((p) => Math.max(1, p - 1)),
                page,
                pageOfLabel: t("pageOf", { page, totalPages }),
                previousLabel: t("previous"),
                totalPages,
              }}
              scrollClassName={grouped ? "rounded-lg" : undefined}
              stickyHeaderShadow
              transparent
            >
              <TeamMembersTable
                columnOrder={columnOrder}
                columnVisibility={columnVisibility}
                grouped={grouped}
                groups={groupedMembers}
                isGroupOpen={isGroupOpen}
                onDataChange={() => {
                  void listQuery.refetch();
                }}
                onRowClick={(m) => navigate(`/mdl/team/${m.id}`)}
                onSelectAll={handleSelectAll}
                onSelectOne={handleSelectOne}
                onSortChange={handleSortChange}
                onToggleGroup={toggleGroup}
                selectedIds={selectedIds}
                sortBy={sortBy}
                sortOrder={sortOrder}
                tableSize={tableSize}
              />
            </AdminListTableView>
          )}

        {!(isLoading || error) &&
          members.length > 0 &&
          viewMode === "cards" && (
            <AdminListCardsView bottomFade>
              <div className="flex flex-col gap-2">
                {groupedMembers.map((group) => {
                  const open = grouped ? isGroupOpen(group.key) : true;
                  return (
                    <Fragment key={group.key}>
                      {grouped && group.label ? (
                        <AdminListGroupHeader
                          count={`${group.members.length}`}
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
                          <TeamMembersCards
                            columnOrder={columnOrder}
                            columnVisibility={columnVisibility}
                            members={group.members}
                            onCardClick={(m) => navigate(`/mdl/team/${m.id}`)}
                            selectedIds={selectedIds}
                            tableSize={tableSize}
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
          (members.length === 0 || viewMode === "cards") && (
            <AdminListPagination
              nextLabel={t("next")}
              onNext={() => void setPage((p) => Math.min(totalPages, p + 1))}
              onPrevious={() => void setPage((p) => Math.max(1, p - 1))}
              page={page}
              pageOfLabel={t("pageOf", { page, totalPages })}
              previousLabel={t("previous")}
              totalPages={totalPages}
            />
          )}
      </div>

      <TeamMemberCreateModal
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
        open={createOpen}
      />
    </section>
  );
}
