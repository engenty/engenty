/**
 * Knowledge Base — Graph view (Sigma.js + Graphology).
 * Renders a force-directed knowledge graph of all articles in the KB.
 * Nodes = articles; edges = parent-child (structural) relationships.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Skeleton } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Network } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KbGraphControls } from "../components/kb-graph/KbGraphControls.js";
import { KbGraphRenderer } from "../components/kb-graph/KbGraphRenderer.js";
import {
  type KbGraphFilter,
  useKbGraphData,
} from "../components/kb-graph/use-kb-graph-data.js";
import { KbModuleShellActions } from "../components/kb-module-shell-actions.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { kbGraphPath } from "../kb-paths.js";
import {
  kbModulePageFillShellSectionClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { kbsQueryOptions } from "../queries.js";
import { kbIdFromSlug, slugFromKbId } from "../resolve-kb-id.js";

const EMPTY_FILTER: KbGraphFilter = {
  search: "",
  statusFilter: "all",
  tagFilter: [],
};

export function KbGraphPage() {
  const { t } = useTranslation("kb");
  const { kbSlug: kbSlugParam } = useParams<{ kbSlug?: string }>();
  const navigate = useNavigate();

  const { data: kbsRaw, isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];

  const kbId = useMemo(() => {
    if (kbSlugParam?.trim()) {
      return kbIdFromSlug(kbs, kbSlugParam);
    }
    return "";
  }, [kbSlugParam, kbs]);

  const kbSlug = useMemo(() => slugFromKbId(kbs, kbId) ?? "", [kbs, kbId]);

  const [filter, setFilter] = useState<KbGraphFilter>(EMPTY_FILTER);
  const [cameraResetNonce, setCameraResetNonce] = useState(0);

  const {
    filteredNodeCount,
    graph,
    isLoading,
    isRefetching,
    error,
    refetch,
    tags,
  } = useKbGraphData(kbId, filter);

  const handleReset = useCallback(() => {
    setFilter({ search: "", statusFilter: "all", tagFilter: [] });
    setCameraResetNonce((n) => n + 1);
  }, []);

  const handleReloadGraph = useCallback(() => {
    void refetch();
    setCameraResetNonce((n) => n + 1);
  }, [refetch]);

  const navigateKb = useCallback(
    (nextKbId: string) => {
      const nextSlug = slugFromKbId(kbs, nextKbId);
      if (nextSlug) {
        navigate(kbGraphPath(nextSlug));
      }
    },
    [kbs, navigate]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId,
    kbSlug,
    onKbChange: navigateKb,
  });

  usePageConfig({
    topbarChrome: "contentBlend",
    breadcrumbs: [
      ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
      { label: t("inbox.nav_graph") },
    ],
    actions:
      kbSlug && !kbsLoading ? <KbModuleShellActions kbSlug={kbSlug} /> : null,
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  /* ── Loading ── */
  if (isLoading || kbsLoading) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <div className="flex flex-1 items-center justify-center gap-3 text-muted-foreground text-sm">
          <Network className="h-5 w-5 animate-pulse opacity-50" />
          {t("inbox.graph_loading")}
        </div>
        <Skeleton className="h-full w-full rounded-xl" />
      </section>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <section
        className={`${kbModulePageShellSectionClassName} items-center justify-center text-destructive text-sm`}
      >
        {String(error)}
      </section>
    );
  }

  /* ── Empty KB ── */
  if (!graph || graph.order === 0) {
    return (
      <section
        className={`${kbModulePageShellSectionClassName} items-center justify-center gap-3 text-muted-foreground`}
      >
        <Network className="h-10 w-10 opacity-25" />
        <p className="text-sm">{t("inbox.graph_empty")}</p>
      </section>
    );
  }

  /* ── Graph ── */
  return (
    <section className={`${kbModulePageFillShellSectionClassName} relative`}>
      {/* Hint bar */}
      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-muted-foreground text-xxs backdrop-blur-sm">
        {t("inbox.graph_hint_dblclick")}
      </div>

      {/* Floating controls */}
      <KbGraphControls
        filter={filter}
        isReloading={isRefetching}
        nodeCount={filteredNodeCount}
        onChange={setFilter}
        onReload={handleReloadGraph}
        onReset={handleReset}
        tags={tags}
      />

      {/* Sigma canvas */}
      <div className="flex-1 overflow-hidden">
        <KbGraphRenderer
          cameraResetNonce={cameraResetNonce}
          graph={graph}
          kbSlug={kbSlug}
        />
      </div>
    </section>
  );
}
