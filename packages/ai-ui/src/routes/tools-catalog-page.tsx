// Tools catalog (ui-6 §4): all tools from GET /ai/registry/tools, table default,
// card view via switcher, source filter + search, custom CRUD entry.

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
import { Link } from "react-router-dom";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildToolCreatePath,
} from "../features/agents-workspace/agent-workspace-paths";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { ToolDeleteDialog } from "../features/tools-catalog/tool-delete-dialog";
import { ToolsCatalogCards } from "../features/tools-catalog/tools-catalog-cards";
import {
  filterTools,
  groupTools,
  type RegistryToolEntry,
  type ToolSourceFilter,
} from "../features/tools-catalog/tools-catalog-state";
import { ToolsCatalogTable } from "../features/tools-catalog/tools-catalog-table";
import { ToolsCatalogToolbar } from "../features/tools-catalog/tools-catalog-toolbar";
import { useAiToolsQuery } from "../lib/admin/ai-runtime-queries";

const TOOLS_DISPLAY_DEFAULTS = {
  columnOrder: [] as string[],
  columnVisibility: {} as Record<string, boolean>,
  sortBy: "name",
  sortOrder: "asc" as const,
  tableSize: "compact" as const,
  viewMode: "table" as const,
};

export function ToolsCatalogPage() {
  const { t } = useTranslation("ai-ui");
  const nav = useWorkspaceNavData();
  const toolsQuery = useAiToolsQuery();
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<ToolSourceFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<RegistryToolEntry | null>(
    null
  );

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

  const { setViewMode, viewMode } = useListDisplayState({
    defaults: TOOLS_DISPLAY_DEFAULTS,
    storageKey: "ai-tools-catalog",
    validSortColumns: ["name"],
    validViewModes: ["table", "cards"],
  });

  const tools = toolsQuery.data?.tools as RegistryToolEntry[] | undefined;
  const filteredTools = useMemo(
    () => filterTools(tools ?? [], { searchQuery, sourceFilter }),
    [tools, searchQuery, sourceFilter]
  );
  const toolGroups = useMemo(
    () =>
      groupTools(filteredTools, {
        custom: t("toolsCatalog.source.custom"),
        mcp: t("toolsCatalog.source.mcp"),
        module: t("toolsCatalog.source.module"),
      }),
    [filteredTools, t]
  );

  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });

  usePageConfig({
    actions: (
      <Button asChild className="gap-1.5" size="sm">
        <Link to={buildToolCreatePath()}>
          <Plus className="size-4" />
          {t("toolsCatalog.newTool")}
        </Link>
      </Button>
    ),
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("toolsCatalog.title") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const isEmpty = !toolsQuery.isLoading && (tools ?? []).length === 0;
  const noResults =
    !toolsQuery.isLoading &&
    (tools ?? []).length > 0 &&
    filteredTools.length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-page">
      <ToolDeleteDialog
        onClose={() => setPendingDelete(null)}
        tool={pendingDelete}
      />

      <ToolsCatalogToolbar
        onSearchChange={setSearchQuery}
        onSourceFilterChange={setSourceFilter}
        onViewModeChange={setViewMode}
        searchQuery={searchQuery}
        sourceFilter={sourceFilter}
        viewMode={viewMode}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {toolsQuery.isLoading ? (
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
                {noResults
                  ? t("toolsCatalog.noResults")
                  : t("toolsCatalog.empty")}
              </EmptyTitle>
              <EmptyDescription>
                {t("toolsCatalog.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {filteredTools.length > 0 && viewMode === "cards" ? (
          <AdminListCardsView bottomFade>
            <ToolsCatalogCards
              grouped
              groups={toolGroups}
              isGroupOpen={isGroupOpen}
              onToggleGroup={toggleGroup}
            />
          </AdminListCardsView>
        ) : null}

        {filteredTools.length > 0 && viewMode === "table" ? (
          <AdminListTableView
            bottomFade
            scrollClassName="rounded-lg"
            stickyHeaderShadow
            transparent
          >
            <ToolsCatalogTable
              grouped
              groups={toolGroups}
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
