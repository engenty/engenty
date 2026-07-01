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
import { Download, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildSkillDetailPath,
} from "../features/agents-workspace/agent-workspace-url-state";
import { getSkillModuleId } from "../features/agents-workspace/skill-record-utils";
import {
  filterAndSortSkills,
  getSkillCatalogModules,
  groupSkills,
  normalizeSkillRecord,
  type SkillCatalogGroupBy,
  type SkillCatalogOriginFilter,
  type SkillCatalogSortBy,
  type SkillCatalogTierFilter,
} from "../features/agents-workspace/skills-catalog-state";
import {
  SkillCatalogCards,
  type SkillCatalogColumnKey,
  type SkillCatalogColumnVisibility,
  SkillCatalogTable,
  SkillCatalogToolbar,
} from "../features/agents-workspace/skills-catalog-view";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import {
  ENGENTY_OPEN_SKILL_CREATE_MODAL,
  ENGENTY_OPEN_SKILL_DETAIL_EDIT,
  type EngentySkillsLocationState,
} from "../features/agents-workspace/workspace-navigation-state";
import { CreateSkillModal } from "../features/skills/create-skill-modal";
import { InstallSkillModal } from "../features/skills/install-skill-modal";
import {
  useAiSkillsQuery,
  useDeleteAiSkillMutation,
} from "../lib/admin/ai-runtime-queries";

const ALL_VALUE = "all";
const SKILL_CATALOG_COLUMNS: SkillCatalogColumnKey[] = [
  "skill",
  "module",
  "sandbox",
  "status",
  "tools",
  "updated",
];
const SKILL_CATALOG_DISPLAY_DEFAULTS = {
  columnOrder: SKILL_CATALOG_COLUMNS,
  columnVisibility: {
    module: true,
    sandbox: true,
    skill: true,
    status: true,
    tools: true,
    updated: true,
  } satisfies SkillCatalogColumnVisibility,
  sortBy: "name" as SkillCatalogSortBy,
  sortOrder: "asc" as const,
  tableSize: "compact" as const,
  viewMode: "table" as const,
};

export function SkillsCatalogPage() {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useWorkspaceNavData();
  const skillsQuery = useAiSkillsQuery();
  const deleteMutation = useDeleteAiSkillMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<SkillCatalogGroupBy>("module");
  const [originFilter, setOriginFilter] =
    useState<SkillCatalogOriginFilter>("all");
  const [tierFilter, setTierFilter] = useState<SkillCatalogTierFilter>("all");
  const [moduleFilter, setModuleFilter] = useState(ALL_VALUE);
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
  const display = useListDisplayState<
    SkillCatalogColumnKey,
    SkillCatalogSortBy
  >({
    defaults: SKILL_CATALOG_DISPLAY_DEFAULTS,
    storageKey: "ai-skills-catalog",
    validSortColumns: ["name", "module", "updated_at"],
    validViewModes: ["table", "cards"],
  });
  const {
    columnOrder,
    columnVisibility,
    setColumnOrder,
    setColumnVisibility,
    setSortBy,
    setSortOrder,
    setTableSize,
    setViewMode,
    sortBy,
    sortOrder,
    tableSize,
    viewMode,
  } = display;

  const existingSkillNames = useMemo(
    () => new Set((skillsQuery.data?.skills ?? []).map((s) => s.name)),
    [skillsQuery.data?.skills]
  );

  useEffect(() => {
    const state = location.state as EngentySkillsLocationState | null;
    if (state?.[ENGENTY_OPEN_SKILL_CREATE_MODAL]) {
      setCreateOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const onSkillCreated = useCallback(
    (skillName: string) => {
      setCreateOpen(false);
      navigate(buildSkillDetailPath(skillName, { file: "SKILL.md" }), {
        replace: true,
        state: { [ENGENTY_OPEN_SKILL_DETAIL_EDIT]: true },
      });
    },
    [navigate]
  );

  const shellNav = useAgentsWorkspaceShellNav({
    ...nav,
    selectedAgentId: "",
  });

  const navSkills = useMemo(
    () =>
      (skillsQuery.data?.skills ?? []).toSorted((left, right) =>
        `${getSkillModuleId(left)}:${left.name}`.localeCompare(
          `${getSkillModuleId(right)}:${right.name}`
        )
      ),
    [skillsQuery.data?.skills]
  );
  const normalizedSkills = useMemo(
    () => (skillsQuery.data?.skills ?? []).map(normalizeSkillRecord),
    [skillsQuery.data?.skills]
  );
  const moduleOptions = useMemo(
    () => [
      { label: t("skillsCatalog.filterAllModules"), value: ALL_VALUE },
      ...getSkillCatalogModules(normalizedSkills).map((moduleId) => ({
        label: moduleId,
        value: moduleId,
      })),
    ],
    [normalizedSkills, t]
  );
  const catalogState = useMemo(
    () => ({
      groupBy,
      moduleFilter,
      originFilter,
      searchQuery,
      sortBy,
      sortOrder,
      tierFilter,
    }),
    [
      groupBy,
      moduleFilter,
      originFilter,
      searchQuery,
      sortBy,
      sortOrder,
      tierFilter,
    ]
  );
  const filteredSkills = useMemo(
    () => filterAndSortSkills(normalizedSkills, catalogState),
    [catalogState, normalizedSkills]
  );
  const groupedSkills = useMemo(
    () =>
      groupSkills(filteredSkills, groupBy, {
        core: t("skills.origin.core"),
        custom: t("skillsCatalog.tierCustom"),
        managed: t("skillsCatalog.tierManaged"),
        module: t("skills.origin.module"),
        tenant: t("skills.origin.tenant"),
        ungrouped: t("skillsCatalog.allSkills"),
      }),
    [filteredSkills, groupBy, t]
  );
  const hasActiveFilters =
    originFilter !== "all" || tierFilter !== "all" || moduleFilter !== "all";

  const handleSortChange = useCallback(
    (column: SkillCatalogSortBy) => {
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [setSortBy, setSortOrder, sortBy, sortOrder]
  );

  const openSkillDetail = useCallback(
    (skillName: string) => {
      navigate(buildSkillDetailPath(skillName, { file: "SKILL.md" }));
    },
    [navigate]
  );

  usePageConfig({
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("workspace.sidebarSkills") },
    ],
    actions: (
      <div className="flex items-center gap-2">
        <Button
          className="gap-1.5"
          onClick={() => setInstallOpen(true)}
          size="sm"
          variant="outline"
        >
          <Download className="size-4" />
          {t("skillsCatalog.install")}
        </Button>
        <Button
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
          size="sm"
        >
          <Plus className="size-4" />
          {t("skillsCatalog.create")}
        </Button>
      </div>
    ),
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-page">
      <CreateSkillModal
        existingSkillNames={existingSkillNames}
        onCreated={onSkillCreated}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />

      <InstallSkillModal
        existingSkillNames={existingSkillNames}
        onInstalled={openSkillDetail}
        onOpenChange={setInstallOpen}
        open={installOpen}
      />

      <SkillCatalogToolbar
        columnOrder={columnOrder}
        columnVisibility={columnVisibility}
        filtersExpanded={filtersExpanded}
        groupBy={groupBy}
        hasActiveFilters={hasActiveFilters}
        labels={{
          ascending: t("skillsCatalog.sortAscending"),
          cardsView: t("skillsCatalog.cardsView"),
          columnSandbox: t("skillsCatalog.columnSandbox"),
          columnTools: t("skillsCatalog.columnTools"),
          compactView: t("skillsCatalog.compactView"),
          descending: t("skillsCatalog.sortDescending"),
          display: t("skillsCatalog.display"),
          displayedColumns: t("skillsCatalog.displayedColumns"),
          filterAllModules: t("skillsCatalog.filterAllModules"),
          filterToggle: t("skillsCatalog.filterToggle"),
          groupBy: t("skillsCatalog.groupBy"),
          groupByModule: t("skillsCatalog.groupByModule"),
          groupByNone: t("skillsCatalog.groupByNone"),
          groupBySource: t("skillsCatalog.groupBySource"),
          groupByTier: t("skillsCatalog.groupByTier"),
          hiddenInTable: t("skillsCatalog.hiddenInTable"),
          hideAll: t("skillsCatalog.hideAll"),
          module: t("skillsCatalog.module"),
          noColumnsDisplayed: t("skillsCatalog.noColumnsDisplayed"),
          origin: t("skillsCatalog.origin"),
          originAll: t("skillsCatalog.originAll"),
          originCore: t("skills.origin.core"),
          originModule: t("skills.origin.module"),
          originTenant: t("skills.origin.tenant"),
          paginationSummary: t("skillsCatalog.count", {
            count: filteredSkills.length,
            total: normalizedSkills.length,
          }),
          searchPlaceholder: t("skillsCatalog.searchPlaceholder"),
          showAll: t("skillsCatalog.showAll"),
          sortBy: t("skillsCatalog.sortBy"),
          sortByModule: t("skillsCatalog.sortByModule"),
          sortByName: t("skillsCatalog.sortByName"),
          sortByUpdated: t("skillsCatalog.sortByUpdated"),
          tableView: t("skillsCatalog.tableView"),
          tier: t("skillsCatalog.tier"),
          tierAll: t("skillsCatalog.tierAll"),
          tierCustom: t("skillsCatalog.tierCustom"),
          tierManaged: t("skillsCatalog.tierManaged"),
        }}
        moduleFilter={moduleFilter}
        moduleOptions={moduleOptions}
        onFiltersToggle={() => setFiltersExpanded((open) => !open)}
        onGroupByChange={setGroupBy}
        onModuleFilterChange={setModuleFilter}
        onOriginFilterChange={setOriginFilter}
        onSearchChange={setSearchQuery}
        onSortByChange={setSortBy}
        onSortOrderChange={setSortOrder}
        onTierFilterChange={setTierFilter}
        originFilter={originFilter}
        searchQuery={searchQuery}
        setColumnOrder={setColumnOrder}
        setColumnVisibility={setColumnVisibility}
        setTableSize={setTableSize}
        setViewMode={setViewMode}
        sortBy={sortBy}
        sortOrder={sortOrder}
        tableSize={tableSize}
        tierFilter={tierFilter}
        viewMode={viewMode}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {skillsQuery.isLoading ? (
          <AdminListTableView>
            <div className="space-y-3 p-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton className="h-10 rounded-md" key={index} />
              ))}
            </div>
          </AdminListTableView>
        ) : null}
        {!skillsQuery.isLoading && navSkills.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("skillsCatalog.empty")}</EmptyTitle>
              <EmptyDescription>
                {t("skillsCatalog.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {!skillsQuery.isLoading &&
        navSkills.length > 0 &&
        groupedSkills.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("skillsCatalog.noResults")}</EmptyTitle>
              <EmptyDescription>
                {t("skillsCatalog.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {!skillsQuery.isLoading &&
        groupedSkills.length > 0 &&
        viewMode === "cards" ? (
          <AdminListCardsView bottomFade>
            <SkillCatalogCards
              groupBy={groupBy}
              groups={groupedSkills}
              isGroupOpen={isGroupOpen}
              labels={{
                groupCountPlural: t("skillsCatalog.groupCountPlural"),
                groupCountSingular: t("skillsCatalog.groupCountSingular"),
                managed: t("skillsCatalog.tierManaged"),
                needsSandbox: t("skillsCatalog.needsSandbox"),
                noSandbox: t("skillsCatalog.noSandbox"),
                toggleGroup: t("skillsCatalog.toggleGroup"),
                toolsCount: t("skillsCatalog.columnTools"),
                uploaded: t("skillsCatalog.sourceUploaded"),
              }}
              onOpen={openSkillDetail}
              onToggleGroup={toggleGroup}
              tableSize={tableSize}
            />
          </AdminListCardsView>
        ) : null}
        {!skillsQuery.isLoading &&
        groupedSkills.length > 0 &&
        viewMode === "table" ? (
          <AdminListTableView
            bottomFade
            scrollClassName={groupBy === "none" ? undefined : "rounded-lg"}
            stickyHeaderShadow
            transparent
          >
            <SkillCatalogTable
              columnOrder={columnOrder}
              columnVisibility={columnVisibility}
              deletePending={deleteMutation.isPending}
              groupBy={groupBy}
              groups={groupedSkills}
              isGroupOpen={isGroupOpen}
              labels={{
                columnActions: t("skillsCatalog.columnActions"),
                columnModule: t("skillsCatalog.columnModule"),
                columnSandbox: t("skillsCatalog.columnSandbox"),
                columnSkill: t("skillsCatalog.columnSkill"),
                columnStatus: t("skillsCatalog.columnStatus"),
                columnTools: t("skillsCatalog.columnTools"),
                columnUpdated: t("skillsCatalog.columnUpdated"),
                delete: t("skillsCatalog.delete"),
                edit: t("skillsCatalog.edit"),
                groupCountPlural: t("skillsCatalog.groupCountPlural"),
                groupCountSingular: t("skillsCatalog.groupCountSingular"),
                managed: t("skillsCatalog.tierManaged"),
                needsSandbox: t("skillsCatalog.needsSandbox"),
                noSandbox: t("skillsCatalog.noSandbox"),
                open: t("skillsCatalog.open"),
                toggleGroup: t("skillsCatalog.toggleGroup"),
                uploaded: t("skillsCatalog.sourceUploaded"),
              }}
              onDelete={(skillName) => deleteMutation.mutate(skillName)}
              onEdit={(skillName) =>
                navigate(buildSkillDetailPath(skillName), {
                  replace: true,
                  state: { [ENGENTY_OPEN_SKILL_DETAIL_EDIT]: true },
                })
              }
              onOpen={openSkillDetail}
              onSortChange={handleSortChange}
              onToggleGroup={toggleGroup}
              sortBy={sortBy}
              sortOrder={sortOrder}
              tableSize={tableSize}
            />
          </AdminListTableView>
        ) : null}
      </div>
    </section>
  );
}
