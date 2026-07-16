// Artifacts catalog — tenant-wide list of AI-created artifacts, grouped by
// where they physically live (GET /ai/artifacts/all). Read-only overview.

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListCardsView,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Archive, ArchiveX } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useAllArtifactsQuery } from "../artifacts/artifacts-api";
import { AGENTS_WORKSPACE_ROOT_PATH } from "../features/agents-workspace/agent-workspace-paths";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { ArtifactsCatalogCards } from "../features/artifacts-catalog/artifacts-catalog-cards";
import { groupArtifactsByScope } from "../features/artifacts-catalog/artifacts-catalog-state";

export function ArtifactsCatalogPage() {
  const { t } = useTranslation("ai-ui");
  const nav = useWorkspaceNavData();
  const [includeArchived, setIncludeArchived] = useState(false);
  const artifactsQuery = useAllArtifactsQuery(includeArchived);

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

  const rows = artifactsQuery.data;
  const groups = useMemo(() => groupArtifactsByScope(rows ?? []), [rows]);

  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });

  usePageConfig({
    actions: (
      <Button
        className="gap-1.5"
        onClick={() => setIncludeArchived((v) => !v)}
        size="sm"
        variant={includeArchived ? "secondary" : "outline"}
      >
        {includeArchived ? (
          <ArchiveX className="size-4" />
        ) : (
          <Archive className="size-4" />
        )}
        {includeArchived
          ? t("artifactsCatalog.hideArchived")
          : t("artifactsCatalog.showArchived")}
      </Button>
    ),
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("artifactsCatalog.title") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const isEmpty = !artifactsQuery.isLoading && (rows ?? []).length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-page">
      <p className="text-muted-foreground text-sm">
        {t("artifactsCatalog.lede")}
      </p>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {artifactsQuery.isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-24 rounded-lg" key={index} />
            ))}
          </div>
        ) : null}

        {isEmpty ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("artifactsCatalog.empty")}</EmptyTitle>
              <EmptyDescription>
                {t("artifactsCatalog.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {(rows ?? []).length > 0 ? (
          <AdminListCardsView bottomFade>
            <ArtifactsCatalogCards
              groups={groups}
              isGroupOpen={isGroupOpen}
              onToggleGroup={toggleGroup}
            />
          </AdminListCardsView>
        ) : null}
      </div>
    </section>
  );
}
