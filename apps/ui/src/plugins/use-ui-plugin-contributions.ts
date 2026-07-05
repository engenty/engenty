import type { UiContributions } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { useDevPluginReloadEventsSubscription } from "./dev-plugin-reload-events";
import {
  useUiPluginContributionsInvalidateListener,
  useUiPluginContributionsQuery,
} from "./ui-plugin-contributions-queries";

const emptyContributions: UiContributions = {
  routes: [],
  adminMenuItems: [],
  backgroundComponents: [],
  copilotApps: [],
  copilotContributions: [],
  dashboardWidgets: [],
  developmentPanels: [],
  i18nNamespaces: [],
  liveBindings: [],
  navigationPrefetch: [],
  settingsItems: [],
  tabs: [],
};

interface UseUiPluginContributionsOptions {
  enabled?: boolean;
  /** When set, plugin list is tenant-scoped (respects tenant activation). */
  tenantId?: string | null;
}

export function useUiPluginContributions(
  options: UseUiPluginContributionsOptions = {}
) {
  const { enabled = true, tenantId = null } = options;
  useUiPluginContributionsInvalidateListener();
  useDevPluginReloadEventsSubscription();
  const query = useUiPluginContributionsQuery(tenantId, enabled);

  const contributions = query.data?.contributions ?? emptyContributions;
  const diagnostics = query.data?.diagnostics ?? [];
  const ready = query.isFetched;

  const hasWarnings = useMemo(
    () => diagnostics.some((entry) => entry.level === "warn"),
    [diagnostics]
  );

  return {
    contributions,
    diagnostics,
    hasWarnings,
    ready,
  };
}
