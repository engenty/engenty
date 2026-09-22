import { getEngentyI18nApi } from "@engenty/i18n/ui";
import { queryOptions, useQuery } from "@engenty/query-client";
import type { UiContributions, UiPluginSummary } from "@engenty/ui-plugin-sdk";
import { publicUiPluginCatalog } from "./public-catalog";
import { resolveUiPlugins, type UiResolutionDiagnostic } from "./resolver";

const emptyContributions: UiContributions = {
  routes: [],
  adminMenuItems: [],
  // Background components never run in the unauthenticated/public shell.
  backgroundComponents: [],
  chatCommands: [],
  copilotContributions: [],
  dashboardWidgets: [],
  developmentPanels: [],
  i18nNamespaces: [],
  liveBindings: [],
  navigationPrefetch: [],
  settingsItems: [],
  spaceTabs: [],
  tabs: [],
};

const publicUiPlugins: UiPluginSummary[] = publicUiPluginCatalog.map(
  (entry) => ({
    id: entry.id,
    enabled: true,
    loaded: true,
  })
);

export interface PublicUiPluginContributionsData {
  contributions: UiContributions;
  diagnostics: UiResolutionDiagnostic[];
}

export async function resolvePublicUiPluginContributions(): Promise<PublicUiPluginContributionsData> {
  const resolved = await resolveUiPlugins({
    catalog: publicUiPluginCatalog,
    plugins: publicUiPlugins,
    i18nApi: getEngentyI18nApi(),
  });

  return {
    contributions: {
      ...resolved.contributions,
      routes: resolved.contributions.routes.filter(
        (route) => route.scope === "public"
      ),
    },
    diagnostics: resolved.diagnostics,
  };
}

export const publicUiPluginContributionsKeys = {
  all: ["public-ui-plugin-contributions"] as const,
};

export function publicUiPluginContributionsOptions(enabled: boolean) {
  return queryOptions({
    queryKey: publicUiPluginContributionsKeys.all,
    queryFn: resolvePublicUiPluginContributions,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function usePublicUiPluginContributions(enabled: boolean) {
  const query = useQuery(publicUiPluginContributionsOptions(enabled));

  return {
    contributions: query.data?.contributions ?? emptyContributions,
    diagnostics: query.data?.diagnostics ?? [],
    error: query.error,
    ready: query.isFetched,
  };
}
