import { getEngentyI18nApi } from "@engenty/i18n/ui";
import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import {
  CONTRIBUTIONS_INVALIDATE_EVENT,
  type PluginDiagnostic,
  type UiContributions,
} from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect } from "react";
import { getPlugins } from "../lib/api/client";
import { deriveUiPluginCatalogFromSummaries, uiPluginCatalog } from "./catalog";
import { resolveUiPlugins, type UiResolutionDiagnostic } from "./resolver";

/**
 * Increment when plugin catalog, resolver rules, or menu ordering semantics change so
 * production `contributionsCache` entries are not reused across deploys.
 */
const UI_CONTRIBUTIONS_CACHE_VERSION = 6;

interface UiPluginGenerationEntry {
  generationId?: number;
  id: string;
}

interface UiPluginContributionsCacheEntry {
  contributions: UiContributions;
  diagnostics: UiResolutionDiagnostic[];
  pluginGenerations: Record<string, number | null>;
}

export interface UiPluginContributionInvalidation {
  generationId?: number;
  pluginId?: string;
  reason?: string;
}

/** Cache key for a set of enabled plugin ids/generations (and optional tenant). */
function contributionsCacheKey(
  tenantId: string | null,
  enabledPlugins: UiPluginGenerationEntry[]
): string {
  const sorted = [...enabledPlugins]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((plugin) => `${plugin.id}@${plugin.generationId ?? "unknown"}`);
  return `${UI_CONTRIBUTIONS_CACHE_VERSION}|${tenantId ?? ""}|${sorted.join(",")}`;
}

function pluginGenerationsFor(
  enabledPlugins: UiPluginGenerationEntry[]
): Record<string, number | null> {
  return Object.fromEntries(
    enabledPlugins.map((plugin) => [plugin.id, plugin.generationId ?? null])
  );
}

export function shouldInvalidateUiPluginCacheEntry(
  pluginGenerations: Record<string, number | null>,
  invalidation: UiPluginContributionInvalidation
) {
  if (!invalidation.pluginId) {
    return true;
  }
  const cachedGeneration = pluginGenerations[invalidation.pluginId];
  return (
    cachedGeneration !== undefined &&
    (invalidation.generationId === undefined ||
      cachedGeneration !== invalidation.generationId)
  );
}

/**
 * Cache of resolved contributions so we run plugin registrars (and i18n registerNamespace)
 * only once per distinct set of enabled plugins per app lifecycle.
 */
const contributionsCache = new Map<string, UiPluginContributionsCacheEntry>();

const alwaysEnabledUiPlugins = [
  "ai-ui",
  "auth-ui",
  "user-management-ui",
  "audit-logs",
  "engenty-copilot",
] as const;

function forceUiPluginEnabled<TPlugin extends { effectiveState?: unknown }>(
  plugin: TPlugin & { enabled?: boolean; loaded?: boolean }
): TPlugin & { enabled: true; loaded: boolean } {
  const effectiveState =
    plugin.effectiveState &&
    typeof plugin.effectiveState === "object" &&
    !Array.isArray(plugin.effectiveState)
      ? {
          ...plugin.effectiveState,
          allowed: true,
          blockedReasons: [],
          globallyEnabled: true,
          state: "enabled",
          tenantEnabled: true,
        }
      : plugin.effectiveState;
  return {
    ...plugin,
    enabled: true,
    effectiveState,
    loaded: plugin.loaded ?? true,
  };
}

export interface UiPluginContributionsData {
  contributions: UiContributions;
  diagnostics: UiResolutionDiagnostic[];
  pluginGenerations: Record<string, number | null>;
}

export interface UiPluginContributionsQueryClient {
  invalidateQueries: (filters: {
    queryKey: readonly unknown[];
  }) => Promise<unknown> | unknown;
  setQueriesData?: (
    filters: { queryKey: readonly unknown[] },
    updater: (
      data: UiPluginContributionsData | undefined
    ) => UiPluginContributionsData | undefined
  ) => unknown;
}

export const uiPluginContributionsKeys = {
  all: ["ui-plugin-contributions"] as const,
  list: (tenantId: string | null) =>
    [...uiPluginContributionsKeys.all, tenantId] as const,
};

export function uiPluginContributionsOptions(
  tenantId: string | null,
  enabled: boolean
) {
  const shouldLoad = enabled;
  return queryOptions({
    queryKey: uiPluginContributionsKeys.list(tenantId),
    queryFn: async ({ signal }): Promise<UiPluginContributionsData> => {
      const result = await getPlugins(signal, tenantId ?? undefined);
      const mergedPlugins = [
        ...result.map((p) =>
          alwaysEnabledUiPlugins.includes(
            p.id as (typeof alwaysEnabledUiPlugins)[number]
          )
            ? forceUiPluginEnabled(p)
            : p
        ),
        ...alwaysEnabledUiPlugins
          .filter((id) => !result.some((p) => p.id === id))
          .map((id) => ({ id, enabled: true, loaded: true })),
      ];
      // Match resolver: UI contributions depend on tenant enabled state, not server `loaded`.
      const enabledIds = mergedPlugins
        .filter((p) => p.enabled)
        .map((p) => ({ generationId: p.generationId, id: p.id }));
      const key = contributionsCacheKey(tenantId, enabledIds);
      const useMemoryCache = !import.meta.env.DEV;
      if (useMemoryCache) {
        const cached = contributionsCache.get(key);
        if (cached) {
          return cached;
        }
      }
      const resolved = await resolveUiPlugins({
        catalog: deriveUiPluginCatalogFromSummaries({
          generatedCatalog: uiPluginCatalog,
          plugins: mergedPlugins,
        }),
        plugins: mergedPlugins,
        i18nApi: getEngentyI18nApi(),
      });
      const data: UiPluginContributionsData = {
        contributions: resolved.contributions,
        diagnostics: resolved.diagnostics,
        pluginGenerations: pluginGenerationsFor(enabledIds),
      };
      if (useMemoryCache) {
        contributionsCache.set(key, data);
      }
      return data;
    },
    enabled: shouldLoad,
  });
}

function staleUiContributionsRemovedDiagnostic(params: {
  count: number;
  pluginId: string;
}): PluginDiagnostic {
  return {
    code: "plugin.ui.stale_contributions_removed",
    level: "warn",
    pluginId: params.pluginId,
    message: `${params.count} stale UI contribution${params.count === 1 ? "" : "s"} from plugin "${params.pluginId}" were removed from the active UI cache.`,
    remediation:
      "Refetch UI contributions for the active plugin generation before rendering module routes, menus, or panels.",
  };
}

function removePluginOwnedItems<TItem extends { pluginId?: string }>(
  items: TItem[],
  pluginId: string
) {
  const kept: TItem[] = [];
  let removed = 0;
  for (const item of items) {
    if (item.pluginId === pluginId) {
      removed += 1;
      continue;
    }
    kept.push(item);
  }
  return { items: kept, removed };
}

export function pruneStaleUiPluginContributionsData(
  data: UiPluginContributionsData | undefined,
  invalidation: UiPluginContributionInvalidation
): UiPluginContributionsData | undefined {
  if (!(data && invalidation.pluginId)) {
    return data;
  }
  if (
    !shouldInvalidateUiPluginCacheEntry(data.pluginGenerations, invalidation)
  ) {
    return data;
  }

  const pluginId = invalidation.pluginId;
  const routes = removePluginOwnedItems(data.contributions.routes, pluginId);
  const adminMenuItems = removePluginOwnedItems(
    data.contributions.adminMenuItems,
    pluginId
  );
  const copilotApps = removePluginOwnedItems(
    data.contributions.copilotApps,
    pluginId
  );
  const copilotContributions = removePluginOwnedItems(
    data.contributions.copilotContributions,
    pluginId
  );
  const dashboardWidgets = removePluginOwnedItems(
    data.contributions.dashboardWidgets,
    pluginId
  );
  // `?? []`: cached query data may predate this contribution kind.
  const backgroundComponents = removePluginOwnedItems(
    data.contributions.backgroundComponents ?? [],
    pluginId
  );
  const developmentPanels = removePluginOwnedItems(
    data.contributions.developmentPanels,
    pluginId
  );
  const i18nNamespaces = removePluginOwnedItems(
    data.contributions.i18nNamespaces,
    pluginId
  );
  const navigationPrefetch = removePluginOwnedItems(
    data.contributions.navigationPrefetch,
    pluginId
  );
  const settingsItems = removePluginOwnedItems(
    data.contributions.settingsItems,
    pluginId
  );
  const tabs = removePluginOwnedItems(data.contributions.tabs, pluginId);
  const removed =
    routes.removed +
    adminMenuItems.removed +
    copilotApps.removed +
    copilotContributions.removed +
    dashboardWidgets.removed +
    backgroundComponents.removed +
    developmentPanels.removed +
    i18nNamespaces.removed +
    navigationPrefetch.removed +
    settingsItems.removed +
    tabs.removed;

  if (removed === 0) {
    return data;
  }

  return {
    contributions: {
      routes: routes.items,
      adminMenuItems: adminMenuItems.items,
      copilotApps: copilotApps.items,
      copilotContributions: copilotContributions.items,
      dashboardWidgets: dashboardWidgets.items,
      backgroundComponents: backgroundComponents.items,
      developmentPanels: developmentPanels.items,
      i18nNamespaces: i18nNamespaces.items,
      navigationPrefetch: navigationPrefetch.items,
      settingsItems: settingsItems.items,
      tabs: tabs.items,
    },
    diagnostics: [
      ...data.diagnostics,
      staleUiContributionsRemovedDiagnostic({
        count: removed,
        pluginId,
      }),
    ],
    pluginGenerations: {
      ...data.pluginGenerations,
      [pluginId]: invalidation.generationId ?? null,
    },
  };
}

export function useUiPluginContributionsQuery(
  tenantId: string | null,
  enabled: boolean
) {
  return useQuery(uiPluginContributionsOptions(tenantId, enabled));
}

export function invalidateUiPluginContributions(
  queryClient: UiPluginContributionsQueryClient,
  invalidation: UiPluginContributionInvalidation = {}
) {
  queryClient.setQueriesData?.(
    { queryKey: uiPluginContributionsKeys.all },
    (data) => pruneStaleUiPluginContributionsData(data, invalidation)
  );
  if (invalidation.pluginId) {
    for (const [key, entry] of contributionsCache) {
      if (
        shouldInvalidateUiPluginCacheEntry(
          entry.pluginGenerations,
          invalidation
        )
      ) {
        contributionsCache.delete(key);
      }
    }
  } else {
    contributionsCache.clear();
  }
  return queryClient.invalidateQueries({
    queryKey: uiPluginContributionsKeys.all,
  });
}

export interface ReloadUiRefreshMarker {
  generationId?: number;
  invalidationRequired?: boolean;
  pluginId?: string;
  reason?: string;
}

export interface ReloadUiRefreshCarrier {
  uiRefresh?: ReloadUiRefreshMarker;
}

export function consumePluginReloadUiRefresh(
  queryClient: UiPluginContributionsQueryClient,
  result: ReloadUiRefreshCarrier
) {
  const marker = result.uiRefresh;
  if (marker?.invalidationRequired !== true || !marker?.pluginId) {
    return;
  }
  return invalidateUiPluginContributions(queryClient, {
    generationId: marker.generationId,
    pluginId: marker.pluginId,
    reason: marker.reason,
  });
}

export function useInvalidateUiPluginContributions() {
  const queryClient = useQueryClient();
  return useCallback(
    (invalidation?: UiPluginContributionInvalidation) => {
      void invalidateUiPluginContributions(queryClient, invalidation);
    },
    [queryClient]
  );
}

export function useUiPluginContributionsInvalidateListener() {
  const invalidate = useInvalidateUiPluginContributions();
  useEffect(() => {
    const onInvalidate = (event: Event) => {
      const detail =
        event instanceof CustomEvent && typeof event.detail === "object"
          ? (event.detail as
              | ReloadUiRefreshMarker
              | { uiRefresh?: ReloadUiRefreshMarker }
              | null)
          : null;
      const marker =
        detail && "uiRefresh" in detail ? detail.uiRefresh : detail;
      invalidate({
        generationId: marker?.generationId,
        pluginId: marker?.pluginId,
        reason: marker?.reason,
      });
    };
    window.addEventListener(CONTRIBUTIONS_INVALIDATE_EVENT, onInvalidate);
    return () =>
      window.removeEventListener(CONTRIBUTIONS_INVALIDATE_EVENT, onInvalidate);
  }, [invalidate]);
}
