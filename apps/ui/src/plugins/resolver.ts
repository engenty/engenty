import { createStubI18nApi } from "@engenty/i18n";
import type {
  EngentyI18nApi,
  PluginDiagnostic,
  PluginSourceInfo,
  UiAdminMenuItemContribution,
  UiChatCommandContribution,
  UiContributions,
  UiDashboardWidgetContribution,
  UiDevelopmentPanelContribution,
  UiI18nNamespaceContribution,
  UiNavigationPrefetchContribution,
  UiPluginSummary,
  UiRouteContribution,
  UiSettingsItemContribution,
  UiSpaceTabContribution,
  UiTabContribution,
} from "@engenty/ui-plugin-sdk";
import {
  DEFAULT_PLUGIN_PLACEMENT,
  PLUGIN_PLACEMENTS,
} from "@engenty/ui-plugin-sdk";
import type { UiPluginCatalogEntry } from "./catalog";
import {
  createEngentyPluginsApi,
  createEngentyUiApi,
  createUiPluginRuntime,
  resolveUiContributions,
} from "./engenty-ui-api";
import { UiPluginRuntimeLoadError } from "./runtime-ui-loader";

export type UiResolutionDiagnostic = PluginDiagnostic;

interface UiEffectiveStateSummary {
  allowed: boolean;
  blockedReasons: string[];
  capabilityAvailable: boolean;
  dependencySatisfied: boolean;
  globallyEnabled: boolean;
  loaded: boolean;
  state: string;
  tenantEnabled: boolean;
}

type UiPluginRuntimeSummary = UiPluginSummary & {
  effectiveState?: UiEffectiveStateSummary;
  generationId?: number;
};

interface OwnedUiContribution {
  pluginId?: string;
  sourceInfo?: PluginSourceInfo;
}

export interface ResolveUiPluginsResult {
  contributions: UiContributions;
  diagnostics: UiResolutionDiagnostic[];
}

interface DuplicateCheckParams<TItem> {
  items: TItem[];
  key: (item: TItem) => string;
}

function dedupeByKey<TItem>(params: DuplicateCheckParams<TItem>) {
  const seen = new Set<string>();
  const deduped: TItem[] = [];
  const duplicates: TItem[] = [];

  for (const item of params.items) {
    const value = params.key(item);
    if (seen.has(value)) {
      duplicates.push(item);
      continue;
    }
    seen.add(value);
    deduped.push(item);
  }

  return { deduped, duplicates };
}

function diagnostic(params: PluginDiagnostic): UiResolutionDiagnostic {
  return params;
}

function loadFailureDiagnostic(params: {
  entry: UiPluginCatalogEntry;
  error: unknown;
}) {
  if (params.error instanceof UiPluginRuntimeLoadError) {
    return diagnostic({
      code: params.error.code,
      level: "error",
      pluginId: params.error.pluginId,
      message: params.error.message,
      remediation: params.error.remediation,
      sourceInfo: params.entry.sourceInfo,
    });
  }

  return diagnostic({
    code: "plugin.load.failed",
    level: "error",
    pluginId: params.entry.id,
    message: `UI plugin failed: ${params.error instanceof Error ? params.error.message : String(params.error)}`,
    remediation:
      "Fix the UI plugin import or registration error for this plugin.",
    sourceInfo: params.entry.sourceInfo,
  });
}

function sourceInfoFor(
  item: { sourceInfo?: UiResolutionDiagnostic["sourceInfo"] } | undefined
) {
  return item?.sourceInfo;
}

function catalogSourceInfoFor(
  entry: UiPluginCatalogEntry,
  plugin: UiPluginRuntimeSummary | undefined
) {
  if (!entry.sourceInfo) {
    return;
  }
  const generationId = plugin?.generationId;
  if (generationId === undefined) {
    return entry.sourceInfo;
  }
  return {
    ...entry.sourceInfo,
    generationId,
    pluginId: entry.sourceInfo?.pluginId ?? entry.id,
  };
}

function byOrderThenLabel<TItem extends { order?: number; label?: string }>(
  left: TItem,
  right: TItem
) {
  const leftOrder = left.order ?? 0;
  const rightOrder = right.order ?? 0;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return (left.label ?? "").localeCompare(right.label ?? "");
}

function isPluginEffective(plugin: UiPluginRuntimeSummary | undefined) {
  if (!plugin) {
    return false;
  }
  return plugin.effectiveState?.allowed ?? plugin.enabled;
}

function staleContributionReason(params: {
  activeGenerations: Map<string, number | undefined>;
  item: OwnedUiContribution;
  uiEligibleIds: Set<string>;
}) {
  const pluginId = params.item.pluginId?.trim();
  if (!pluginId) {
    return "unowned";
  }
  if (!params.uiEligibleIds.has(pluginId)) {
    return "plugin_not_ui_eligible";
  }
  if (
    params.item.sourceInfo?.pluginId &&
    params.item.sourceInfo.pluginId !== pluginId
  ) {
    return "source_plugin_mismatch";
  }
  const expectedGeneration = params.activeGenerations.get(pluginId);
  const actualGeneration = params.item.sourceInfo?.generationId;
  if (
    expectedGeneration !== undefined &&
    actualGeneration !== undefined &&
    expectedGeneration !== actualGeneration
  ) {
    return "generation_mismatch";
  }
  return null;
}

function staleContributionRemovedDiagnostic(params: {
  item: OwnedUiContribution;
  kind: string;
  reason: string;
}) {
  const pluginId =
    params.item.pluginId?.trim() || params.item.sourceInfo?.pluginId;
  return diagnostic({
    code: "plugin.ui.stale_contribution_removed",
    level: "warn",
    pluginId,
    message: `stale ${params.kind} UI contribution${pluginId ? ` from plugin "${pluginId}"` : ""} was removed (${params.reason}).`,
    remediation:
      "Refetch UI contributions for the active plugin generation and keep filter-added contributions plugin-owned.",
    sourceInfo: params.item.sourceInfo,
  });
}

function removeStaleOwnedContributions<TItem extends OwnedUiContribution>(
  items: TItem[],
  params: {
    activeGenerations: Map<string, number | undefined>;
    diagnostics: UiResolutionDiagnostic[];
    kind: string;
    uiEligibleIds: Set<string>;
  }
) {
  const kept: TItem[] = [];
  for (const item of items) {
    const reason = staleContributionReason({
      activeGenerations: params.activeGenerations,
      item,
      uiEligibleIds: params.uiEligibleIds,
    });
    if (reason) {
      params.diagnostics.push(
        staleContributionRemovedDiagnostic({
          item,
          kind: params.kind,
          reason,
        })
      );
      continue;
    }
    kept.push(item);
  }
  return kept;
}

function normalizeAdminMenuItems(items: UiAdminMenuItemContribution[]) {
  const sorted = [...items].sort(byOrderThenLabel);
  const { deduped, duplicates } = dedupeByKey({
    items: sorted,
    key: (item) => item.id,
  });

  const idSet = new Set(deduped.map((item) => item.id));
  const orphanedParents = deduped
    .filter((item) => item.parentId && !idSet.has(item.parentId))
    .map((item) => item);

  const cleaned = deduped.map((item) => {
    if (!item.parentId || idSet.has(item.parentId)) {
      return item;
    }
    return { ...item, parentId: undefined };
  });

  return {
    items: cleaned,
    diagnostics: [
      ...duplicates.map((item) =>
        diagnostic({
          code: "plugin.registration.duplicate_admin_menu_item",
          level: "warn",
          message: `duplicate admin menu id "${item.id}" from plugin "${item.pluginId}" was ignored.`,
          pluginId: item.pluginId,
          remediation:
            "Use a unique admin menu item id for this UI contribution.",
          sourceInfo: sourceInfoFor(item),
        })
      ),
      ...orphanedParents.map((item) =>
        diagnostic({
          code: "plugin.registration.orphaned_admin_menu_parent",
          level: "warn",
          message: `admin menu "${item.id}" from plugin "${item.pluginId}" references missing parent "${item.parentId}".`,
          pluginId: item.pluginId,
          remediation:
            "Register the parent admin menu contribution or remove parentId.",
          sourceInfo: sourceInfoFor(item),
        })
      ),
    ],
  };
}

function normalizeRoutes(items: UiRouteContribution[]) {
  const sorted = [...items].sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0)
  );
  const dedupeById = dedupeByKey({
    items: sorted,
    key: (item) => item.id,
  });
  const dedupeByPath = dedupeByKey({
    items: dedupeById.deduped,
    key: (item) => item.path,
  });
  const invalidScopes = dedupeByPath.deduped
    .filter((item) => {
      const scope = (item as { scope?: string }).scope;
      return (
        scope !== undefined && scope !== "authenticated" && scope !== "public"
      );
    })
    .map((item) => item);
  const cleaned = dedupeByPath.deduped.map((item): UiRouteContribution => {
    const scope = (item as { scope?: string }).scope;
    if (
      scope === undefined ||
      scope === "authenticated" ||
      scope === "public"
    ) {
      return item;
    }
    const { scope: omittedScope, ...rest } = item as UiRouteContribution & {
      scope?: string;
    };
    void omittedScope;
    return rest;
  });

  return {
    items: cleaned,
    diagnostics: [
      ...dedupeById.duplicates.map((item) =>
        diagnostic({
          code: "plugin.registration.duplicate_route",
          level: "warn",
          message: `duplicate route id "${item.id}" from plugin "${item.pluginId}" was ignored.`,
          pluginId: item.pluginId,
          remediation: "Use a unique route id for this UI route contribution.",
          sourceInfo: sourceInfoFor(item),
        })
      ),
      ...dedupeByPath.duplicates.map((item) =>
        diagnostic({
          code: "plugin.registration.duplicate_path",
          level: "warn",
          message: `duplicate route path "${item.path}" from plugin "${item.pluginId}" was ignored.`,
          pluginId: item.pluginId,
          remediation:
            "Move one route to a unique path or disable the duplicate contribution.",
          sourceInfo: sourceInfoFor(item),
        })
      ),
      ...invalidScopes.map((item) =>
        diagnostic({
          code: "plugin.registration.invalid_route_scope",
          level: "warn",
          message: `invalid route scope "${(item as { scope?: string }).scope}" for route "${item.id}" from plugin "${item.pluginId}" was removed.`,
          pluginId: item.pluginId,
          remediation: 'Use route scope "authenticated" or "public".',
          sourceInfo: sourceInfoFor(item),
        })
      ),
    ],
  };
}

function normalizeSettingsItems(items: UiSettingsItemContribution[]) {
  const sorted = [...items].sort(byOrderThenLabel);
  const dedupeById = dedupeByKey({
    items: sorted,
    key: (item) => item.id,
  });
  const dedupeByPath = dedupeByKey({
    items: dedupeById.deduped,
    key: (item) => item.to,
  });

  return {
    items: dedupeByPath.deduped,
    diagnostics: [
      ...dedupeById.duplicates.map((item) =>
        diagnostic({
          code: "plugin.registration.duplicate_settings_item",
          level: "warn",
          message: `duplicate settings item id "${item.id}" from plugin "${item.pluginId}" was ignored.`,
          pluginId: item.pluginId,
          remediation:
            "Use a unique settings item id for this UI contribution.",
          sourceInfo: sourceInfoFor(item),
        })
      ),
      ...dedupeByPath.duplicates.map((item) =>
        diagnostic({
          code: "plugin.registration.duplicate_path",
          level: "warn",
          message: `duplicate settings path "${item.to}" from plugin "${item.pluginId}" was ignored.`,
          pluginId: item.pluginId,
          remediation:
            "Move one settings item to a unique path or disable the duplicate contribution.",
          sourceInfo: sourceInfoFor(item),
        })
      ),
    ],
  };
}

function normalizeDashboardWidgets(items: UiDashboardWidgetContribution[]) {
  const sorted = [...items].sort(byOrderThenLabel);
  const dedupeById = dedupeByKey({
    items: sorted,
    key: (item) => item.id,
  });

  return {
    items: dedupeById.deduped,
    diagnostics: dedupeById.duplicates.map((item) =>
      diagnostic({
        code: "plugin.registration.duplicate_dashboard_widget",
        level: "warn",
        message: `duplicate dashboard widget id "${item.id}" from plugin "${item.pluginId}" was ignored.`,
        pluginId: item.pluginId,
        remediation: "Use a unique dashboard widget id for this contribution.",
        sourceInfo: sourceInfoFor(item),
      })
    ),
  };
}

function normalizeChatCommands(items: UiChatCommandContribution[]) {
  const sorted = [...items].sort(byOrderThenLabel);
  const valid: UiChatCommandContribution[] = [];
  const diagnostics: PluginDiagnostic[] = [];
  for (const item of sorted) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item.command)) {
      diagnostics.push(
        diagnostic({
          code: "plugin.registration.invalid_chat_command",
          level: "warn",
          message: `chat command "${item.command}" from plugin "${item.pluginId}" is not a valid slash token and was ignored.`,
          pluginId: item.pluginId,
          remediation:
            "Use a lowercase ASCII token (letters, digits, dashes) for the command.",
          sourceInfo: sourceInfoFor(item),
        })
      );
      continue;
    }
    valid.push(item);
  }
  // Command tokens are unique per surface — the first (order-sorted) wins.
  const dedupe = dedupeByKey({
    items: valid,
    key: (item) => `${item.surface ?? "chat"}::${item.command}`,
  });

  return {
    items: dedupe.deduped,
    diagnostics: [
      ...diagnostics,
      ...dedupe.duplicates.map((item) =>
        diagnostic({
          code: "plugin.registration.duplicate_chat_command",
          level: "warn",
          message: `duplicate chat command "/${item.command}" from plugin "${item.pluginId}" was ignored.`,
          pluginId: item.pluginId,
          remediation:
            "Use a unique command token within the target surface for this contribution.",
          sourceInfo: sourceInfoFor(item),
        })
      ),
    ],
  };
}

function normalizeTabs(items: UiTabContribution[]) {
  const sorted = [...items].sort(byOrderThenLabel);
  // Tab ids are unique per surface, not globally — a "files" tab may exist on
  // several surfaces. Dedupe on the (surface, id) pair.
  const dedupe = dedupeByKey({
    items: sorted,
    key: (item) => `${item.surface}::${item.id}`,
  });

  return {
    items: dedupe.deduped,
    diagnostics: dedupe.duplicates.map((item) =>
      diagnostic({
        code: "plugin.registration.duplicate_tab",
        level: "warn",
        message: `duplicate tab "${item.id}" for surface "${item.surface}" from plugin "${item.pluginId}" was ignored.`,
        pluginId: item.pluginId,
        remediation:
          "Use a unique tab id within the target surface for this contribution.",
        sourceInfo: sourceInfoFor(item),
      })
    ),
  };
}

/** Host-owned space sections — a plugin cannot claim these ids. */
const RESERVED_SPACE_TAB_IDS = new Set(["work", "data", "settings"]);

function normalizeSpaceTabs(items: UiSpaceTabContribution[]) {
  const reserved: UiSpaceTabContribution[] = [];
  const usable: UiSpaceTabContribution[] = [];
  for (const item of items) {
    if (RESERVED_SPACE_TAB_IDS.has(item.id.toLowerCase())) {
      reserved.push(item);
      continue;
    }
    usable.push(item);
  }
  const sorted = [...usable].sort(byOrderThenLabel);
  const dedupe = dedupeByKey({
    items: sorted,
    key: (item) => item.id,
  });

  return {
    items: dedupe.deduped,
    diagnostics: [
      ...reserved.map((item) =>
        diagnostic({
          code: "plugin.registration.reserved_space_tab",
          level: "warn",
          message: `space tab "${item.id}" from plugin "${item.pluginId}" was ignored — work, data and settings belong to the space.`,
          pluginId: item.pluginId,
          remediation:
            'Pick a section id that is not work, data, or settings (for example "plan").',
          sourceInfo: sourceInfoFor(item),
        })
      ),
      ...dedupe.duplicates.map((item) =>
        diagnostic({
          code: "plugin.registration.duplicate_space_tab",
          level: "warn",
          message: `duplicate space tab "${item.id}" from plugin "${item.pluginId}" was ignored.`,
          pluginId: item.pluginId,
          remediation: "Use a unique space-tab id per plugin contribution.",
          sourceInfo: sourceInfoFor(item),
        })
      ),
    ],
  };
}

function normalizeNavigationPrefetch(
  items: UiNavigationPrefetchContribution[]
) {
  const sorted = [...items].sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0)
  );
  const dedupeById = dedupeByKey({
    items: sorted,
    key: (item) => item.id,
  });

  return {
    items: dedupeById.deduped,
    diagnostics: dedupeById.duplicates.map((item) =>
      diagnostic({
        code: "plugin.registration.duplicate_navigation_prefetch",
        level: "warn",
        message: `duplicate navigation prefetch id "${item.id}" from plugin "${item.pluginId}" was ignored.`,
        pluginId: item.pluginId,
        remediation:
          "Use a unique navigation prefetch id for this contribution.",
        sourceInfo: sourceInfoFor(item),
      })
    ),
  };
}

function normalizeDevelopmentPanels(items: UiDevelopmentPanelContribution[]) {
  const sorted = [...items].sort(byOrderThenLabel);
  const dedupeById = dedupeByKey({
    items: sorted,
    key: (item) => item.id,
  });

  return {
    items: dedupeById.deduped,
    diagnostics: dedupeById.duplicates.map((item) =>
      diagnostic({
        code: "plugin.registration.duplicate_development_panel",
        level: "warn",
        message: `duplicate development panel id "${item.id}" from plugin "${item.pluginId}" was ignored.`,
        pluginId: item.pluginId,
        remediation: "Use a unique development panel id for this contribution.",
        sourceInfo: sourceInfoFor(item),
      })
    ),
  };
}

function normalizeI18nNamespaces(items: UiI18nNamespaceContribution[]) {
  const sorted = [...items].sort((left, right) =>
    left.namespace.localeCompare(right.namespace)
  );
  const dedupeByNamespace = dedupeByKey({
    items: sorted,
    key: (item) => item.namespace,
  });

  return {
    items: dedupeByNamespace.deduped,
    diagnostics: dedupeByNamespace.duplicates.map((item) =>
      diagnostic({
        code: "plugin.registration.duplicate_i18n_namespace",
        level: "warn",
        message: `duplicate i18n namespace "${item.namespace}" from plugin "${item.pluginId}" was ignored.`,
        pluginId: item.pluginId,
        remediation:
          "Use a unique i18n namespace or merge locale loaders in one contribution.",
        sourceInfo: sourceInfoFor(item),
      })
    ),
  };
}

interface EligibleUiPlugin {
  entry: UiPluginCatalogEntry;
  plugin: UiPluginRuntimeSummary | undefined;
}

function collectOptionalPeerDiagnostics(params: {
  catalogIds: Set<string>;
  diagnostics: UiResolutionDiagnostic[];
  entry: UiPluginCatalogEntry;
  pluginsById: Map<string, UiPluginRuntimeSummary>;
}) {
  for (const pluginId of params.entry.optionalPluginIds ?? []) {
    if (!params.catalogIds.has(pluginId)) {
      params.diagnostics.push(
        diagnostic({
          code: "plugin.ui.optional_peer_missing",
          level: "warn",
          pluginId: params.entry.id,
          message: `Optional UI peer "${pluginId}" declared by "${params.entry.id}" is not present in the UI plugin catalog.`,
          remediation:
            "Add the peer UI plugin to the generated catalog or remove the optional dependency declaration.",
          sourceInfo: params.entry.sourceInfo,
        })
      );
      continue;
    }

    const peer = params.pluginsById.get(pluginId);
    if (peer?.enabled && !peer.loaded) {
      params.diagnostics.push(
        diagnostic({
          code: "plugin.ui.optional_peer_not_loaded",
          level: "warn",
          pluginId: params.entry.id,
          message: `Optional UI peer "${pluginId}" declared by "${params.entry.id}" is enabled but not loaded.`,
          remediation:
            "Check the peer plugin's server diagnostics before relying on its exposed UI API.",
          sourceInfo: params.entry.sourceInfo,
        })
      );
    }
  }
}

async function importEligibleUiPlugins(params: {
  eligible: readonly EligibleUiPlugin[];
  pluginsById: Map<string, UiPluginRuntimeSummary>;
}) {
  return await Promise.all(
    params.eligible.map(async ({ entry, plugin }) => {
      try {
        const registerUiPlugin = await entry.loadUiPlugin({
          generationId: plugin?.generationId,
          isGenerationCurrent: (generationId, pluginId) =>
            params.pluginsById.get(pluginId)?.generationId === generationId,
        });
        return { ok: true as const, entry, plugin, registerUiPlugin };
      } catch (error) {
        return { ok: false as const, entry, error, plugin };
      }
    })
  );
}

export async function resolveUiPlugins(params: {
  catalog: UiPluginCatalogEntry[];
  plugins: UiPluginRuntimeSummary[];
  i18nApi?: EngentyI18nApi | null;
}) {
  const catalogIds = new Set(params.catalog.map((entry) => entry.id));
  const pluginsById = new Map(
    params.plugins.map((plugin) => [plugin.id, plugin])
  );
  /** Server/runtime: cross-plugin API and `isPluginEnabled` only when the API plugin actually loaded. */
  const loadedEnabledIds = new Set(
    params.plugins
      .filter((plugin) => isPluginEffective(plugin) && plugin.loaded)
      .map((plugin) => plugin.id)
  );
  const uiEligibleIds = new Set(
    params.plugins
      .filter((plugin) => isPluginEffective(plugin))
      .map((plugin) => plugin.id)
  );
  const activeGenerations = new Map(
    params.plugins.map((plugin) => [plugin.id, plugin.generationId])
  );
  const runtime = createUiPluginRuntime(loadedEnabledIds);
  const diagnostics: UiResolutionDiagnostic[] = [];

  const eligible: EligibleUiPlugin[] = [];
  const loadedPluginIds: string[] = [];
  for (const entry of params.catalog) {
    const plugin = pluginsById.get(entry.id);
    if (!uiEligibleIds.has(entry.id)) {
      if (plugin?.effectiveState && !plugin.effectiveState.allowed) {
        diagnostics.push(
          diagnostic({
            code: "plugin.ui.effective_state_blocked",
            level: "warn",
            pluginId: entry.id,
            message: `UI plugin "${entry.id}" was skipped because its effective state is "${plugin.effectiveState.state}".`,
            remediation:
              "Review the plugin effective state and unblock load, global, tenant, or dependency requirements before exposing UI contributions.",
            sourceInfo: entry.sourceInfo,
          })
        );
      }
      continue;
    }

    collectOptionalPeerDiagnostics({
      catalogIds,
      diagnostics,
      entry,
      pluginsById,
    });
    loadedPluginIds.push(entry.id);
    eligible.push({ entry, plugin });
  }

  const i18nApi = params.i18nApi ?? null;
  const importedPlugins = await importEligibleUiPlugins({
    eligible,
    pluginsById,
  });

  for (const imported of importedPlugins) {
    if (!imported.ok) {
      diagnostics.push(
        loadFailureDiagnostic({
          entry: imported.entry,
          error: imported.error,
        })
      );
      continue;
    }

    try {
      const catalogSourceInfo = catalogSourceInfoFor(
        imported.entry,
        imported.plugin
      );
      imported.registerUiPlugin({
        UI: createEngentyUiApi(imported.entry.id, runtime, catalogSourceInfo),
        plugins: createEngentyPluginsApi(imported.entry.id, runtime),
        i18n: i18nApi ?? createStubI18nApi(),
      });
      void runtime.hooks.emit("ui.pluginRegistered", {
        pluginId: imported.entry.id,
      });
    } catch (error) {
      diagnostics.push(loadFailureDiagnostic({ entry: imported.entry, error }));
    }
  }

  void runtime.hooks.emit("ui.pluginsLoaded", { pluginIds: loadedPluginIds });
  const filtered = await resolveUiContributions(runtime);
  const cleanupParams = {
    activeGenerations,
    diagnostics,
    uiEligibleIds,
  };
  const routes = removeStaleOwnedContributions(filtered.routes, {
    ...cleanupParams,
    kind: "route",
  });
  const adminMenuItems = removeStaleOwnedContributions(
    filtered.adminMenuItems,
    {
      ...cleanupParams,
      kind: "admin menu",
    }
  );
  const dashboardWidgets = removeStaleOwnedContributions(
    filtered.dashboardWidgets,
    {
      ...cleanupParams,
      kind: "dashboard widget",
    }
  );
  const developmentPanels = removeStaleOwnedContributions(
    filtered.developmentPanels,
    {
      ...cleanupParams,
      kind: "development panel",
    }
  );
  const i18nNamespaces = removeStaleOwnedContributions(
    filtered.i18nNamespaces,
    {
      ...cleanupParams,
      kind: "i18n namespace",
    }
  );
  const navigationPrefetch = removeStaleOwnedContributions(
    filtered.navigationPrefetch,
    {
      ...cleanupParams,
      kind: "navigation prefetch",
    }
  );
  const settingsItems = removeStaleOwnedContributions(filtered.settingsItems, {
    ...cleanupParams,
    kind: "settings item",
  });
  const tabs = removeStaleOwnedContributions(filtered.tabs, {
    ...cleanupParams,
    kind: "tab",
  });
  const spaceTabs = removeStaleOwnedContributions(filtered.spaceTabs ?? [], {
    ...cleanupParams,
    kind: "space tab",
  });
  const chatCommands = removeStaleOwnedContributions(
    filtered.chatCommands ?? [],
    {
      ...cleanupParams,
      kind: "chat command",
    }
  );
  const copilotContributions = removeStaleOwnedContributions(
    filtered.copilotContributions ?? [],
    {
      ...cleanupParams,
      kind: "copilot",
    }
  );
  const liveBindings = removeStaleOwnedContributions(
    filtered.liveBindings ?? [],
    {
      ...cleanupParams,
      kind: "live binding",
    }
  );
  const backgroundComponents = removeStaleOwnedContributions(
    filtered.backgroundComponents ?? [],
    {
      ...cleanupParams,
      kind: "background component",
    }
  );

  const routesNormalized = normalizeRoutes(routes);
  const menuNormalized = normalizeAdminMenuItems(adminMenuItems);
  const dashboardWidgetsNormalized =
    normalizeDashboardWidgets(dashboardWidgets);
  const developmentPanelsNormalized =
    normalizeDevelopmentPanels(developmentPanels);
  const i18nNamespacesNormalized = normalizeI18nNamespaces(i18nNamespaces);
  const navigationPrefetchNormalized =
    normalizeNavigationPrefetch(navigationPrefetch);
  const settingsNormalized = normalizeSettingsItems(settingsItems);
  // Attach catalog `category` from the plugin summary (engenty.plugin.json).
  // Display order of categories is PLUGIN_CATEGORIES; item `order` is within-category only.
  const settingsItemsWithCategory = settingsNormalized.items.map((item) => ({
    ...item,
    category: item.category ?? pluginsById.get(item.pluginId)?.category,
  }));
  // Placement (PLAN-spaces.md Phase 5a) rides alongside `category` and takes the
  // identical route, but its ABSENT case is not a shrug: a module with no
  // declared placement is treated as `space` and named in a diagnostic. The
  // opposite default would let an unmigrated module reappear on the app rail
  // silently, which is the wrong-and-invisible outcome.
  const adminMenuItemsWithCategory = menuNormalized.items.map((item) => {
    const plugin = pluginsById.get(item.pluginId);
    const placement = item.placement ?? plugin?.placement;
    // Only the `modules` section is placed: zone ④'s admin stack is untouched
    // by Phase 5a, so demanding a placement from Files or Audit logs would be
    // asking for a declaration that decides nothing.
    if (!placement && item.section === "modules") {
      diagnostics.push(
        diagnostic({
          code: "plugin.registration.missing_placement",
          level: "warn",
          message: `plugin "${item.pluginId}" declares no placement in engenty.plugin.json; menu item "${item.id}" is treated as "${DEFAULT_PLUGIN_PLACEMENT}".`,
          pluginId: item.pluginId,
          remediation: `Add "placement": one of ${PLUGIN_PLACEMENTS.join(", ")} to the plugin manifest.`,
          sourceInfo: sourceInfoFor(item),
        })
      );
    }
    return {
      ...item,
      category: item.category ?? plugin?.category,
      placement: placement ?? DEFAULT_PLUGIN_PLACEMENT,
    };
  });
  const tabsNormalized = normalizeTabs(tabs);
  const spaceTabsNormalized = normalizeSpaceTabs(spaceTabs);
  const chatCommandsNormalized = normalizeChatCommands(chatCommands);

  diagnostics.push(
    ...routesNormalized.diagnostics,
    ...menuNormalized.diagnostics,
    ...dashboardWidgetsNormalized.diagnostics,
    ...developmentPanelsNormalized.diagnostics,
    ...i18nNamespacesNormalized.diagnostics,
    ...navigationPrefetchNormalized.diagnostics,
    ...settingsNormalized.diagnostics,
    ...tabsNormalized.diagnostics,
    ...spaceTabsNormalized.diagnostics,
    ...chatCommandsNormalized.diagnostics
  );

  return {
    contributions: {
      routes: routesNormalized.items,
      adminMenuItems: adminMenuItemsWithCategory,
      backgroundComponents,
      brandSource: filtered.brandSource,
      chatCommands: chatCommandsNormalized.items,
      copilotArticleHrefResolver: filtered.copilotArticleHrefResolver,
      copilotContributions,
      dashboardWidgets: dashboardWidgetsNormalized.items,
      developmentPanels: developmentPanelsNormalized.items,
      i18nNamespaces: i18nNamespacesNormalized.items,
      liveBindings,
      navigationPrefetch: navigationPrefetchNormalized.items,
      settingsItems: settingsItemsWithCategory,
      spaceTabs: spaceTabsNormalized.items,
      tabs: tabsNormalized.items,
    },
    diagnostics,
  } satisfies ResolveUiPluginsResult;
}
