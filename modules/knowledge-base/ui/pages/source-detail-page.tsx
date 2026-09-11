/**
 * KB dynamic source detail — read-only summary, schedule, webhook, items, run logs.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Edit } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { scheduleForEnabledToggle } from "../../src/sources/schedule-for-enabled-toggle.js";
import { SourceDetailItemsPanel } from "../components/source-detail-items-panel.js";
import { SourceDetailRunsSection } from "../components/source-detail-runs-section.js";
import { SourceDetailSchedulerSection } from "../components/source-detail-scheduler-section.js";
import { SourceDetailSummarySection } from "../components/source-detail-summary-section.js";
import { SourceDetailWebhookSection } from "../components/source-detail-webhook-section.js";
import { SourceIngestStrategyPanel } from "../components/source-ingest-strategy-panel.js";
import { SourceRunProgressBanner } from "../components/source-run-progress-banner.js";
import { useKbSourceDetailAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-content.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { kbSourceEditPath, kbSourcesPath } from "../kb-paths.js";
import { mergeKbSourceAdaptersForPicker } from "../kb-source-adapters-merge.js";
import {
  kbModulePageFillShellSectionClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import {
  kbSourceDetailQueryOptions,
  sourceAdaptersQueryOptions,
  useKbSourceMutations,
  useKbsQuery,
} from "../queries.js";
import { spaceKbId } from "../resolve-kb-id.js";

const SOURCE_DETAIL_TAB_IDS = ["overview", "sync", "ingest"] as const;
type SourceDetailTabId = (typeof SOURCE_DETAIL_TAB_IDS)[number];
const DEFAULT_SOURCE_DETAIL_TAB: SourceDetailTabId = "overview";
const SOURCE_DETAIL_TAB_SET = new Set<string>(SOURCE_DETAIL_TAB_IDS);
const SOURCE_DETAIL_LEGACY_TAB_MAP: Record<string, SourceDetailTabId> = {
  execute: "sync",
  logs: "sync",
  settings: "overview",
  items: "overview",
};

export function SourceDetailPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { sourceId } = useParams<{ sourceId: string }>();
  const [itemsPage, setItemsPage] = useState(1);
  const [lastWebhookToken, setLastWebhookToken] = useState<string | null>(null);

  const { data: kbsRaw, isLoading: kbsLoading } = useKbsQuery();
  const { data: adaptersRaw = [] } = useQuery(sourceAdaptersQueryOptions);
  const adapters = useMemo(
    () => mergeKbSourceAdaptersForPicker(adaptersRaw),
    [adaptersRaw]
  );
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];
  const kbIdFromUrl = useMemo(() => spaceKbId(kbs), [kbs]);

  const {
    data: detail,
    isLoading: detailLoading,
    error: detailError,
  } = useQuery({
    ...kbSourceDetailQueryOptions(sourceId ?? ""),
    refetchInterval: (query) =>
      query.state.data?.data?.last_run_status === "running" ||
      query.state.data?.runs?.some((run) => run.status === "running")
        ? 2000
        : false,
  });
  const source = detail?.data;
  const runs = detail?.runs ?? [];
  const runningRun = runs.find((r) => r.status === "running") ?? null;
  useKbSourceDetailAgentUiSlice(source ?? null);

  const kbId = source?.kb_id ?? kbIdFromUrl ?? "";

  const listQuery = useMemo(
    () =>
      kbId
        ? {
            kb_id: kbId,
            page: 1,
            page_size: 25,
            sort_by: "updated_at" as const,
            sort_order: "desc" as const,
          }
        : undefined,
    [kbId]
  );
  const mutations = useKbSourceMutations(listQuery);

  useEffect(() => {
    setItemsPage(1);
  }, [sourceId]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const redirect = tab ? SOURCE_DETAIL_LEGACY_TAB_MAP[tab] : undefined;
    if (!redirect) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set("tab", redirect);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const sourcesListHref = kbSourcesPath();

  const adapterLabel = useMemo(() => {
    if (!source) {
      return "";
    }
    return (
      adapters.find((a) => a.id === source.adapter_id)?.label ??
      source.adapter_id.replaceAll("_", " ")
    );
  }, [adapters, source]);

  const defaultScheduleMinutes = useMemo(() => {
    if (!source) {
      return 60;
    }
    const v = adapters.find(
      (a) => a.id === source.adapter_id
    )?.schedule_default_minutes;
    return typeof v === "number" && v >= 5 ? v : 60;
  }, [adapters, source]);

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId: kbId || "",
  });

  const tabParam = searchParams.get("tab");
  const detailTab: SourceDetailTabId =
    tabParam && SOURCE_DETAIL_TAB_SET.has(tabParam)
      ? (tabParam as SourceDetailTabId)
      : DEFAULT_SOURCE_DETAIL_TAB;

  const onDetailTabChange = useCallback(
    (next: string) => {
      if (!SOURCE_DETAIL_TAB_SET.has(next) || next === detailTab) {
        return;
      }
      const nextParams = new URLSearchParams(searchParams);
      if (next === DEFAULT_SOURCE_DETAIL_TAB) {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", next);
      }
      if (nextParams.toString() !== searchParams.toString()) {
        setSearchParams(nextParams, { replace: true });
      }
    },
    [detailTab, searchParams, setSearchParams]
  );

  const pageActions = useMemo(
    () =>
      source ? (
        <Button
          className={topbarIconButtonClassName}
          onClick={() => navigate(kbSourceEditPath(source.id))}
          size="sm"
          type="button"
        >
          <Edit className="h-4 w-4" />
          <TopbarActionLabel>{t("sources.edit")}</TopbarActionLabel>
        </Button>
      ) : null,
    [navigate, source, t]
  );

  usePageConfig({
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs: source
      ? [
          ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
          { label: t("sources.title"), to: sourcesListHref },
          { label: source.name },
        ]
      : [{ label: t("sources.title"), to: sourcesListHref }, { label: "…" }],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (kbsLoading || (detailLoading && !detailError)) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  if (detailError || !source || !sourceId) {
    return (
      <section className={`${kbModulePageShellSectionClassName} gap-3`}>
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
          {detailError instanceof Error
            ? detailError.message
            : t("sources.source_not_found")}
        </div>
        <Button
          onClick={() => navigate(sourcesListHref)}
          type="button"
          variant="outline"
        >
          {t("sources.back_to_list")}
        </Button>
      </section>
    );
  }

  return (
    <section className={kbModulePageFillShellSectionClassName}>
      <Tabs
        className="flex min-h-0 w-full flex-1 flex-col gap-0"
        onValueChange={onDetailTabChange}
        value={detailTab}
      >
        <header className="w-full shrink-0 border-b bg-muted/30">
          <div className="mx-auto max-w-4xl space-y-1 px-4 pt-3 md:px-5">
            <p className="font-medium text-muted-foreground text-xs">
              {adapterLabel}
            </p>
            <h1 className="font-semibold text-lg tracking-tight">
              {source.name}
            </h1>
          </div>
          <div className="mx-auto flex max-w-4xl items-end px-4 pb-0 md:px-5">
            <TabsList
              className="-mb-px w-fit border-0 bg-transparent p-0"
              variant="line"
            >
              <TabsTrigger value="overview">
                {t("sources.detail_tab_overview")}
              </TabsTrigger>
              <TabsTrigger value="sync">
                {t("sources.detail_tab_sync")}
              </TabsTrigger>
              <TabsTrigger value="ingest">
                {t("sources.detail_tab_ingest")}
              </TabsTrigger>
            </TabsList>
          </div>
        </header>

        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-y-auto p-page">
          <TabsContent className="space-y-3" value="overview">
            <SourceDetailSummarySection
              defaultIntervalMinutes={defaultScheduleMinutes}
              enabledTogglePending={mutations.update.isPending}
              onEnabledChange={(enabled) =>
                mutations.update.mutate(
                  { id: source.id, input: { enabled } },
                  {
                    onError: (err) =>
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : t("sources.save_failed")
                      ),
                  }
                )
              }
              onRunNow={() => mutations.run.mutate(source.id)}
              onStopRun={() => {
                if (runningRun) {
                  mutations.stopRun.mutate({
                    runId: runningRun.id,
                    sourceId: source.id,
                  });
                }
              }}
              runPending={mutations.run.isPending || !!runningRun}
              source={source}
              stopRunPending={mutations.stopRun.isPending}
            />
            {(() => {
              const settingsLimit =
                typeof source.settings?.limit === "number"
                  ? source.settings.limit
                  : null;
              return runningRun ? (
                <SourceRunProgressBanner
                  run={runningRun}
                  settingsLimit={settingsLimit}
                />
              ) : null;
            })()}
            <SourceDetailItemsPanel
              itemsPage={itemsPage}
              listQuery={listQuery}
              runs={runs}
              setItemsPage={setItemsPage}
              source={source}
            />
          </TabsContent>

          <TabsContent className="space-y-6" value="ingest">
            <div>
              <h2 className="font-semibold text-base">
                {t("sources.detail_tab_ingest")}
              </h2>
              <p className="mt-0.5 text-muted-foreground text-sm">
                {t("sources.ingest_panel_desc")}
              </p>
            </div>
            <SourceIngestStrategyPanel
              ingestConfig={source.ingest_config}
              kbId={kbId}
              sourceId={source.id}
              syncRunning={!!runningRun}
            />
          </TabsContent>

          <TabsContent className="space-y-6" value="sync">
            <SourceDetailSchedulerSection
              defaultIntervalMinutes={defaultScheduleMinutes}
              onEdit={() => navigate(kbSourceEditPath(source.id))}
              onRunNow={() => mutations.run.mutate(source.id)}
              onScheduleEnabledChange={(enabled) => {
                const schedule = scheduleForEnabledToggle(
                  source.schedule,
                  enabled,
                  defaultScheduleMinutes
                );
                mutations.update.mutate(
                  { id: source.id, input: { schedule } },
                  {
                    onError: (err) =>
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : t("sources.save_failed")
                      ),
                  }
                );
              }}
              runPending={mutations.run.isPending}
              scheduleTogglePending={mutations.update.isPending}
              source={source}
            />
            <SourceDetailWebhookSection
              lastPlainToken={lastWebhookToken}
              onRegenerate={() =>
                mutations.rotateWebhook.mutate(source.id, {
                  onSuccess: (result) => {
                    setLastWebhookToken(result.webhook_token);
                    toast.info(t("sources.webhook_token_created"));
                  },
                })
              }
              regeneratePending={mutations.rotateWebhook.isPending}
              source={source}
            />
            <SourceDetailRunsSection
              clearRunsMutation={mutations.clearRuns}
              runs={runs}
              sourceId={source.id}
            />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
