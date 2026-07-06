// One provider row on the search-index console: health counts (from its own
// status query), the effective retrieval config (read-only "how it works"),
// and a full rebuild. Each card owns its status query so providers load and
// refresh independently.

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Badge, Button, SettingsFormSection } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { RefreshCcw, Wrench } from "lucide-react";
import { useState } from "react";
import { formatRelativeTime } from "@/features/development-settings/derive-session-stats";
import { DevelopmentIndexStat } from "@/features/development-settings/development-index-stat";
import {
  getProviderStatus,
  rebuildProviderFully,
  type SearchIndexProviderConfig,
  type SearchIndexProviderSummary,
} from "@/lib/search-index-admin-api";

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </div>
      <div className="truncate font-medium text-sm tabular-nums">{value}</div>
    </div>
  );
}

function useConfigLabels(config: SearchIndexProviderConfig | null) {
  const { t } = useTranslation("common");
  if (!config) {
    return null;
  }
  const perTenant = t("settings.searchIndex.config.perTenant");
  const none = t("settings.searchIndex.config.none");
  return {
    embeddingModel: config.embeddingModelDynamic
      ? perTenant
      : (config.embeddingModel ?? "—"),
    fastPath:
      config.fastPathMaxTerms == null ? none : String(config.fastPathMaxTerms),
    splitter: config.splitter ?? "—",
    trigram: config.useTrigram
      ? t("settings.searchIndex.config.on")
      : t("settings.searchIndex.config.off"),
    vectorThreshold: config.vectorThresholdDynamic
      ? perTenant
      : config.vectorThreshold == null
        ? "—"
        : config.vectorThreshold.toFixed(2),
    visibility: config.visibility ?? "—",
  };
}

export function SearchIndexProviderCard({
  provider,
}: {
  provider: SearchIndexProviderSummary;
}) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const configLabels = useConfigLabels(provider.config);

  const statusKey = ["search-index-admin", "status", provider.id];
  const statusQuery = useQuery({
    enabled: provider.supports.status !== false,
    queryKey: statusKey,
    queryFn: ({ signal }) => getProviderStatus(provider, signal),
  });

  const rebuildMutation = useMutation({
    mutationFn: () =>
      rebuildProviderFully(provider, {
        onProgress: (done, total) => setProgress({ done, total }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });

  const status = statusQuery.data;
  const missing = status?.missing_count ?? 0;
  const stale = status?.stale_count ?? 0;
  const isRebuilding = rebuildMutation.isPending;
  const canRebuild = provider.supports.backfill !== false;

  return (
    <SettingsFormSection
      description={`${provider.id} · ${provider.module_id}`}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {provider.entity_name}
          <Badge variant={provider.origin === "ai" ? "secondary" : "outline"}>
            {provider.origin}
          </Badge>
          {provider.config?.visibility ? (
            <Badge variant="outline">{provider.config.visibility}</Badge>
          ) : null}
          {provider.is_system ? (
            <Badge variant="secondary">
              {t("settings.searchIndex.overview.systemBadge")}
            </Badge>
          ) : null}
        </span>
      }
    >
      {provider.origin === "ai" && !provider.is_system ? (
        <p className="text-muted-foreground text-xs">
          {t("settings.searchIndex.overview.selfScopedHint")}
        </p>
      ) : null}

      {provider.supports.status === false ? (
        <p className="text-muted-foreground text-sm">
          {t("settings.searchIndex.overview.statusUnsupported")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DevelopmentIndexStat
            label={t("settings.searchIndex.stats.total")}
            value={
              statusQuery.isLoading ? "—" : String(status?.total_count ?? 0)
            }
          />
          <DevelopmentIndexStat
            label={t("settings.searchIndex.stats.indexed")}
            value={
              statusQuery.isLoading ? "—" : String(status?.indexed_count ?? 0)
            }
          />
          <DevelopmentIndexStat
            emphasis={missing > 0 ? "destructive" : "default"}
            label={t("settings.searchIndex.stats.missing")}
            value={statusQuery.isLoading ? "—" : String(missing)}
          />
          <DevelopmentIndexStat
            emphasis={stale > 0 ? "destructive" : "default"}
            hint={
              status?.last_indexed_at
                ? t("settings.searchIndex.stats.lastIndexedHint", {
                    when: formatRelativeTime(status.last_indexed_at),
                  })
                : undefined
            }
            label={t("settings.searchIndex.stats.stale")}
            value={statusQuery.isLoading ? "—" : String(stale)}
          />
        </div>
      )}

      {configLabels ? (
        <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
          <ConfigItem
            label={t("settings.searchIndex.config.visibility")}
            value={configLabels.visibility}
          />
          <ConfigItem
            label={t("settings.searchIndex.config.splitter")}
            value={configLabels.splitter}
          />
          <ConfigItem
            label={t("settings.searchIndex.config.vectorThreshold")}
            value={configLabels.vectorThreshold}
          />
          <ConfigItem
            label={t("settings.searchIndex.config.fastPath")}
            value={configLabels.fastPath}
          />
          <ConfigItem
            label={t("settings.searchIndex.config.trigram")}
            value={configLabels.trigram}
          />
          <ConfigItem
            label={t("settings.searchIndex.config.embeddingModel")}
            value={configLabels.embeddingModel}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          <Wrench className="mr-1 inline h-3 w-3" />
          {t("settings.searchIndex.config.unavailable")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        {isRebuilding && progress ? (
          <span className="mr-auto text-muted-foreground text-xs tabular-nums">
            {t("settings.searchIndex.overview.rebuildProgress", {
              done: progress.done,
              total: progress.total,
            })}
          </span>
        ) : null}
        <Button
          disabled={
            statusQuery.isFetching || provider.supports.status === false
          }
          onClick={() => void statusQuery.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          {statusQuery.isFetching ? (
            <AnimatedLoaderIcon play="always" size="xs" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          {t("settings.searchIndex.overview.refresh")}
        </Button>
        <Button
          disabled={isRebuilding || !canRebuild}
          onClick={() => rebuildMutation.mutate()}
          size="sm"
          type="button"
        >
          {isRebuilding ? (
            <AnimatedLoaderIcon play="always" size="xs" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          {t("settings.searchIndex.overview.rebuild")}
        </Button>
      </div>

      {rebuildMutation.data ? (
        <p className="text-muted-foreground text-sm">
          {t("settings.searchIndex.overview.rebuildSummary", {
            failed: rebuildMutation.data.failed,
            processed: rebuildMutation.data.processed,
          })}
        </p>
      ) : null}

      {statusQuery.isError ? (
        <p className="text-destructive text-sm">
          {t("settings.searchIndex.overview.statusFailed")}
        </p>
      ) : null}

      {rebuildMutation.isError ? (
        <p className="text-destructive text-sm">
          {t("settings.searchIndex.overview.rebuildFailed")}
          {rebuildMutation.error instanceof Error
            ? `: ${rebuildMutation.error.message}`
            : null}
        </p>
      ) : null}
    </SettingsFormSection>
  );
}
