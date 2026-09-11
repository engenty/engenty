import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { Badge, Button } from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import {
  AlertTriangle,
  Box,
  CircleCheck,
  CircleOff,
  RefreshCcw,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { PluginListItem } from "@/lib/api/client";
import {
  pluginKeys,
  usePluginsListQuery,
  useTogglePluginFromListMutation,
} from "@/lib/plugins-queries";

export function TenantPluginsPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    t("navigation.setup")
  );
  const queryClient = useQueryClient();
  const { currentTenant } = useWorkspaceContext();
  const tenantId = currentTenant?.id ?? null;
  const pluginsQuery = usePluginsListQuery(tenantId);
  const toggleMutation = useTogglePluginFromListMutation(tenantId);
  const [restartNotice, setRestartNotice] = useState<string | null>(null);

  const plugins = pluginsQuery.data ?? [];
  const isLoading = pluginsQuery.isLoading && !pluginsQuery.data;
  const errorMessage =
    pluginsQuery.error instanceof Error
      ? pluginsQuery.error.message
      : toggleMutation.error instanceof Error
        ? toggleMutation.error.message
        : pluginsQuery.isError
          ? t("plugins.loadFailed")
          : toggleMutation.isError
            ? t("plugins.updateStateFailed")
            : null;
  const busyPluginId = toggleMutation.isPending
    ? (toggleMutation.variables?.pluginId ?? null)
    : null;

  const pageActions = useMemo(
    () => (
      <Button
        disabled={pluginsQuery.isFetching}
        onClick={() =>
          queryClient.invalidateQueries({
            queryKey: pluginKeys.list(tenantId),
          })
        }
        size="sm"
        variant="outline"
      >
        <RefreshCcw className="mr-1.5 size-3.5" />
        {t("plugins.refresh", { context: "pluginsList" })}
      </Button>
    ),
    [pluginsQuery.isFetching, queryClient, tenantId, t]
  );

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("plugins.title") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
  });

  const togglePlugin = useCallback(
    (plugin: PluginListItem) => {
      if (plugin.mandatory) {
        return;
      }
      toggleMutation.mutate(
        { pluginId: plugin.id, currentlyEnabled: plugin.enabled },
        {
          onSuccess: (response) => {
            if (response.restartRequired) {
              setRestartNotice(response.message);
            }
          },
        }
      );
    },
    [toggleMutation]
  );

  const sorted = useMemo(
    () =>
      [...plugins].sort((a, b) =>
        (a.name ?? a.id).localeCompare(b.name ?? b.id)
      ),
    [plugins]
  );

  if (!tenantId) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <section className="mx-auto max-w-4xl space-y-4 p-page">
          <p className="text-muted-foreground text-sm">
            {t("plugins.tenantRequired")}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <section className="mx-auto max-w-4xl space-y-4 p-page">
        <div className="space-y-3">
          {restartNotice && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-100/10 p-3 text-sm">
              <RefreshCcw className="mt-0.5 size-4 text-amber-600" />
              <p>{restartNotice}</p>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 rounded-md border border-red-400/40 bg-red-100/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 text-red-600" />
              <p>{errorMessage}</p>
            </div>
          )}

          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t("plugins.loading")}
            </p>
          ) : sorted.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("plugins.noneDiscovered")}
            </p>
          ) : (
            <div className="space-y-2">
              {sorted.map((plugin) => (
                <div
                  className="rounded-md border p-3 transition-colors"
                  key={plugin.id}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {plugin.name ?? plugin.id}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {plugin.id}
                        {plugin.version ? ` · v${plugin.version}` : ""}
                        {plugin.packageName ? ` · ${plugin.packageName}` : ""}
                      </p>
                      {plugin.description && (
                        <p className="mt-1 text-muted-foreground text-sm">
                          {plugin.description}
                        </p>
                      )}
                    </div>
                    {plugin.mandatory ? (
                      <Badge className="shrink-0" variant="secondary">
                        {t("plugins.platformBuiltIn")}
                      </Badge>
                    ) : (
                      <Button
                        disabled={busyPluginId === plugin.id}
                        onClick={() => void togglePlugin(plugin)}
                        size="sm"
                        variant={plugin.enabled ? "outline" : "default"}
                      >
                        {plugin.enabled
                          ? t("plugins.deactivate", { context: "plugin" })
                          : t("plugins.activate", { context: "plugin" })}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={plugin.enabled ? "default" : "secondary"}>
                      {plugin.enabled ? (
                        <CircleCheck className="mr-1 size-3" />
                      ) : (
                        <CircleOff className="mr-1 size-3" />
                      )}
                      {plugin.enabled
                        ? t("plugins.enabled", { context: "plugin" })
                        : t("plugins.disabled", { context: "plugin" })}
                    </Badge>
                    <Badge variant={plugin.loaded ? "default" : "secondary"}>
                      {plugin.loaded
                        ? t("plugins.loaded", { context: "plugin" })
                        : t("plugins.notLoaded", { context: "plugin" })}
                    </Badge>
                    {plugin.effectiveState && (
                      <Badge
                        variant={
                          plugin.effectiveState.allowed
                            ? "default"
                            : "secondary"
                        }
                      >
                        {plugin.effectiveState.allowed
                          ? t("plugins.effectiveAvailable")
                          : t("plugins.effectiveBlocked")}
                        {plugin.effectiveState.blockedReasons.length > 0
                          ? `: ${plugin.effectiveState.blockedReasons.join(", ")}`
                          : ""}
                      </Badge>
                    )}
                    {plugin.sourceType && (
                      <Badge variant="outline">{plugin.sourceType}</Badge>
                    )}
                    <Badge variant="outline">
                      <Box className="mr-1 size-3" />
                      {plugin.routesCount}{" "}
                      {t("plugins.routes", { context: "plugin" })}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
