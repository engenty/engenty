import type { PluginSourceInfo } from "@engenty/plugin-sdk";
import type { ComponentType } from "react";

export type {
  PluginDiagnostic,
  PluginSourceInfo,
} from "@engenty/plugin-sdk";

export type UiPluginId = string;
export type UiIconComponent = ComponentType<{ className?: string }>;

/** Route context passed to copilot contribution matching. */
export interface CopilotMatchContext {
  pathname: string;
  scope?: Record<string, unknown>;
}

/** Starter prompt chip shown when chat is empty. */
export interface UiCopilotStarterPrompt {
  id: string;
  label: string;
  prompt: string;
}

export interface UiCopilotApplyContext {
  pathname: string;
  scope: Record<string, unknown>;
}

export type UiCopilotApplyHandler = (
  patch: Record<string, string | null>
) => Promise<void>;

/** Minimal query client surface used after copilot assistant turns (no TanStack peer here). */
export interface CopilotAssistantTurnFinishQueryClient {
  invalidateQueries: (filters: {
    queryKey?: readonly unknown[];
    predicate?: (query: unknown) => boolean;
  }) => Promise<unknown>;
}

/** Copilot contribution from a module. Resolved by pathname/scope. */
export interface UiCopilotContribution {
  applySuggestions?: (
    patch: Record<string, string | null>,
    context: { scope: Record<string, unknown> }
  ) => Promise<void>;
  matches: (context: CopilotMatchContext) => boolean;
  moduleId: string;
  /**
   * Called after suggestions are applied successfully.
   * Use to invalidate module-owned query caches or refresh local module state.
   */
  onApplySuccess?: (args: {
    queryClient: CopilotAssistantTurnFinishQueryClient;
    pathname: string;
    scope: Record<string, unknown>;
  }) => void | Promise<void>;
  /**
   * Called after a successful assistant turn in the shell copilot (not full-page `/chat` binding).
   * Use to invalidate TanStack Query caches when server-side tools mutate module data.
   */
  onAssistantTurnFinish?: (args: {
    queryClient: CopilotAssistantTurnFinishQueryClient;
    pathname: string;
    scope: Record<string, unknown>;
  }) => void | Promise<void>;
  /** Plugin that registered this contribution. */
  pluginId?: string;
  requestedAgentId?: string;
  resolveApplySuggestions?: (
    context: UiCopilotApplyContext
  ) => UiCopilotApplyHandler | null | undefined;
  routeKey: string;
  sourceInfo?: PluginSourceInfo;
  starterPrompts?: UiCopilotStarterPrompt[];
  title?: string;
}

export interface UiCopilotAppContribution {
  icon?: UiIconComponent;
  id: string;
  label: string;
  labelKey?: string;
  order?: number;
  pluginId: UiPluginId;
  sourceInfo?: PluginSourceInfo;
  to: string;
}

export interface UiRouteContribution {
  component: ComponentType;
  id: string;
  order?: number;
  path: string;
  pluginId: UiPluginId;
  scope?: UiRouteScope;
  sourceInfo?: PluginSourceInfo;
}

export type UiRouteScope = "authenticated" | "public";

export type UiAdminMenuSection = "modules" | "admin";

export interface UiAdminMenuItemContribution {
  icon?: UiIconComponent;
  id: string;
  label: string;
  labelKey?: string;
  order?: number;
  parentId?: string;
  pluginId: UiPluginId;
  section: UiAdminMenuSection;
  sourceInfo?: PluginSourceInfo;
  to: string;
  /**
   * Reactive count badge on the app-bar icon. A React hook the shell calls
   * from an always-mounted per-item component (inside the app providers, so
   * react-query works) — return undefined or 0 to hide the badge.
   */
  useBadgeCount?: () => number | undefined;
}

export interface UiSettingsItemContribution {
  id: string;
  label: string;
  labelKey?: string;
  order?: number;
  pluginId: UiPluginId;
  sourceInfo?: PluginSourceInfo;
  to: string;
}

export interface DashboardWidgetSize {
  h: number;
  minH?: number;
  minW?: number;
  w: number;
}

export interface DashboardWidgetRenderProps<TConfig = unknown> {
  config: TConfig;
  id: string;
  mode: "edit" | "view";
  title?: string;
}

export interface UiDashboardWidgetContribution {
  category?: string;
  component: ComponentType<DashboardWidgetRenderProps>;
  configSchema?: unknown;
  createDefaultConfig?: () => unknown;
  defaultSize?: DashboardWidgetSize;
  description?: string;
  id: string;
  order?: number;
  pluginId: UiPluginId;
  sourceInfo?: PluginSourceInfo;
  starterPriority?: number;
  title: string;
}

/**
 * A component a module mounts once, invisibly, for the whole authenticated
 * session — it stays mounted across navigation (rendered next to the app's own
 * background workers, not on any route). Used for things that must keep running
 * whenever the app is open, e.g. the local-files bridge that answers file-read
 * requests from the browser tab that holds a granted directory handle.
 */
export interface UiBackgroundComponentContribution {
  component: ComponentType;
  id: string;
  order?: number;
  pluginId: UiPluginId;
  sourceInfo?: PluginSourceInfo;
}

/**
 * Props passed to a contributed tab body. `surface` identifies the host tab
 * strip (e.g. `"projects.detail"`); `params` carries that host's context
 * (e.g. `{ projectId }`). The contributing module narrows `params` itself.
 */
export interface UiTabRenderProps {
  params: Record<string, unknown>;
  surface: string;
}

/**
 * A tab a module contributes to another surface's tab strip. The tab only
 * exists while the contributing plugin is enabled — a parked module never
 * registers it — so hosts get install-gated tabs for free, with no feature
 * flag or availability check on the host side.
 */
export interface UiTabContribution {
  component: ComponentType<UiTabRenderProps>;
  icon?: UiIconComponent;
  id: string;
  /** Literal label; falls back to `labelKey` translation when absent. */
  label?: string;
  /** i18n key (qualify with the owning namespace, e.g. `"files:detail.tab"`). */
  labelKey?: string;
  order?: number;
  pluginId: UiPluginId;
  sourceInfo?: PluginSourceInfo;
  /** Host surface this tab attaches to, e.g. `"projects.detail"`. */
  surface: string;
}

/** Minimal query client surface used by navigation prefetch contributions. */
export interface UiNavigationPrefetchQueryClient {
  prefetchQuery: (options: unknown) => Promise<unknown>;
}

export interface UiNavigationPrefetchContribution {
  id: string;
  match: (pathname: string) => Record<string, string> | null;
  order?: number;
  pluginId: UiPluginId;
  prefetch: (ctx: {
    params: Record<string, string>;
    pathname: string;
    queryClient: UiNavigationPrefetchQueryClient;
  }) => void | Promise<void>;
  sourceInfo?: PluginSourceInfo;
}

export interface UiDevelopmentPanelContribution {
  component: ComponentType;
  id: string;
  order?: number;
  pluginId: UiPluginId;
  sourceInfo?: PluginSourceInfo;
  title: string;
}

export type UiI18nNamespaceLoader = () => Promise<Record<string, unknown>>;

export interface UiI18nNamespaceContribution {
  loaders: Record<string, UiI18nNamespaceLoader>;
  namespace: string;
  pluginId: UiPluginId;
  sourceInfo?: PluginSourceInfo;
}

/**
 * Postgres change target for a live-data binding. Structurally mirrors
 * `PostgresChangeSpec` in `@engenty/live-cache`; duplicated here on purpose to
 * avoid a dependency cycle (`live-cache` → `auth-ui` → `ui-plugin-sdk`). Keep
 * the two shapes in lockstep.
 */
export interface UiLiveBindingPostgresChange {
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  filter?: string;
  schema: string;
  scope?: "tenant" | "user";
  table: string;
}

/**
 * A module's reactive-data declaration, contributed to the app shell instead of
 * being statically imported. Structurally compatible with `ModuleLiveBinding`
 * in `@engenty/live-cache` (plus `pluginId`/`sourceInfo`), so the app can feed
 * `liveBindings` straight into `buildAgentToolInvalidationMap` /
 * `toLiveCacheBindings`.
 */
export interface UiLiveBindingContribution {
  agentToolIds?: readonly string[];
  id: string;
  pluginId: UiPluginId;
  postgresChanges?: UiLiveBindingPostgresChange[];
  queryRoot: readonly unknown[];
  sourceInfo?: PluginSourceInfo;
}

export interface UiContributions {
  adminMenuItems: UiAdminMenuItemContribution[];
  backgroundComponents: UiBackgroundComponentContribution[];
  copilotApps: UiCopilotAppContribution[];
  /**
   * Optional resolver a module can contribute to turn a (scope slug,
   * article id/slug) pair into a copilot-surfaced article href, mirroring the
   * KB article-link behavior without the app source-importing the module.
   * Last registration wins.
   */
  copilotArticleHrefResolver?: (
    slug: string,
    articleIdOrSlug: string
  ) => string;
  copilotContributions: UiCopilotContribution[];
  dashboardWidgets: UiDashboardWidgetContribution[];
  developmentPanels: UiDevelopmentPanelContribution[];
  i18nNamespaces: UiI18nNamespaceContribution[];
  liveBindings: UiLiveBindingContribution[];
  navigationPrefetch: UiNavigationPrefetchContribution[];
  routes: UiRouteContribution[];
  settingsItems: UiSettingsItemContribution[];
  tabs: UiTabContribution[];
}

export interface UiPluginSummary {
  capabilities?: {
    ai?: boolean;
    frontendTools?: boolean;
    operations?: boolean;
    ui?: boolean;
  };
  dependencies?: string[];
  effectiveState?: {
    allowed: boolean;
    blockedReasons: string[];
    capabilityAvailable: boolean;
    dependencySatisfied: boolean;
    globallyEnabled: boolean;
    loaded: boolean;
    state: string;
    tenantEnabled: boolean;
  };
  enabled: boolean;
  generationId?: number;
  id: string;
  loaded: boolean;
  optional?: string[];
  ui?: {
    assetOrigins?: string[];
    enabled?: boolean;
    entry: string;
    export?: string;
    load?: "runtime" | "workspace";
    staticAssets?: string[];
  };
}

/** Dispatch to trigger contributions re-resolution (e.g. after dynamic menu config change). */
export const CONTRIBUTIONS_INVALIDATE_EVENT = "ui.contributions.invalidate";

/**
 * Typed map of every UI plugin event to its payload.
 *
 * One surface for both jobs: a handler registered via {@link EngentyUiApi.on}
 * may **observe** (return nothing) or **transform** (return the payload) — the
 * unified replacement for the former action/filter split. Events whose payload
 * is a contribution array are the transformable ("filter") ones; the rest are
 * lifecycle notifications.
 */
export interface UiEventMap {
  "ui.adminMenuItems": UiAdminMenuItemContribution[];
  "ui.backgroundComponents": UiBackgroundComponentContribution[];
  "ui.contributionsResolved": UiContributions;
  "ui.copilotApps": UiCopilotAppContribution[];
  "ui.copilotContributions": UiCopilotContribution[];
  "ui.dashboardWidgets": UiDashboardWidgetContribution[];
  "ui.developmentPanels": UiDevelopmentPanelContribution[];
  "ui.i18nNamespaces": UiI18nNamespaceContribution[];
  "ui.liveBindings": UiLiveBindingContribution[];
  "ui.navigationPrefetch": UiNavigationPrefetchContribution[];
  "ui.pluginRegistered": { pluginId: string };
  "ui.pluginsLoaded": { pluginIds: string[] };
  "ui.routes": UiRouteContribution[];
  "ui.settingsItems": UiSettingsItemContribution[];
  "ui.tabs": UiTabContribution[];
}

/** @deprecated Merged into {@link UiEventMap}. Kept as an alias for back-compat. */
export type UiFilterEventMap = UiEventMap;
/** @deprecated Merged into {@link UiEventMap}. Kept as an alias for back-compat. */
export type UiActionEventMap = UiEventMap;

export interface EngentyUiApi {
  /**
   * Subscribe to a UI plugin event. Return nothing to observe, or return the
   * (possibly transformed) payload to feed it to downstream handlers — the
   * unified action/filter primitive.
   */
  on: <TEvent extends keyof UiEventMap & string>(
    event: TEvent,
    handler: (
      payload: UiEventMap[TEvent]
    ) =>
      | UiEventMap[TEvent]
      | undefined
      | Promise<UiEventMap[TEvent] | undefined>
  ) => void;
  registerAdminMenuItem: (input: {
    id: string;
    section: UiAdminMenuSection;
    label: string;
    labelKey?: string;
    to: string;
    icon?: UiIconComponent;
    parentId?: string;
    order?: number;
    useBadgeCount?: () => number | undefined;
  }) => void;
  registerBackgroundComponent: (input: {
    component: ComponentType;
    id: string;
    order?: number;
  }) => void;
  registerCopilotApp: (input: {
    id: string;
    label: string;
    labelKey?: string;
    to: string;
    icon?: UiIconComponent;
    order?: number;
  }) => void;
  registerCopilotArticleHrefResolver: (input: {
    resolve: (slug: string, articleIdOrSlug: string) => string;
  }) => void;
  registerCopilotContribution: (input: UiCopilotContribution) => void;
  registerDashboardWidget: (input: {
    category?: string;
    component: ComponentType<DashboardWidgetRenderProps>;
    configSchema?: unknown;
    createDefaultConfig?: () => unknown;
    defaultSize?: DashboardWidgetSize;
    description?: string;
    id: string;
    order?: number;
    starterPriority?: number;
    title: string;
  }) => void;
  registerDevelopmentPanel: (input: {
    component: ComponentType;
    id: string;
    order?: number;
    title: string;
  }) => void;
  registerI18nNamespace: (input: {
    loaders: Record<string, UiI18nNamespaceLoader>;
    namespace: string;
  }) => void;
  registerLiveBinding: (input: {
    agentToolIds?: readonly string[];
    id: string;
    postgresChanges?: UiLiveBindingPostgresChange[];
    queryRoot: readonly unknown[];
  }) => void;
  registerNavigationPrefetch: (input: {
    id: string;
    match: UiNavigationPrefetchContribution["match"];
    order?: number;
    prefetch: UiNavigationPrefetchContribution["prefetch"];
  }) => void;
  registerRoute: (input: {
    id: string;
    path: string;
    component: ComponentType;
    order?: number;
    scope?: UiRouteScope;
  }) => void;
  registerSettingsItem: (input: {
    id: string;
    label: string;
    labelKey?: string;
    to: string;
    order?: number;
  }) => void;
  registerTab: (input: {
    id: string;
    surface: string;
    component: ComponentType<UiTabRenderProps>;
    label?: string;
    labelKey?: string;
    icon?: UiIconComponent;
    order?: number;
  }) => void;
}

export type PluginMethodsRecord = Record<string, unknown>;

export interface EngentyPluginsApi {
  expose: (methods: PluginMethodsRecord) => void;
  get: <TMethods extends PluginMethodsRecord = PluginMethodsRecord>(
    pluginId: string
  ) => TMethods | null;
  hasPluginApi: (pluginId: string) => boolean;
  isPluginEnabled: (pluginId: string) => boolean;
  register: (pluginId: string, methods: PluginMethodsRecord) => void;
  [key: string]: unknown;
}

export type EngentyI18nApi = import("@engenty/i18n").EngentyI18nApi;

export interface EngentyPluginContext {
  API?: Record<string, unknown>;
  i18n: EngentyI18nApi;
  plugins: EngentyPluginsApi;
  UI: EngentyUiApi;
}

export type UiPluginRegistrar = (engenty: EngentyPluginContext) => void;

export type { ContributionRegistry } from "./contribution-registry.js";
export { createContributionRegistry } from "./contribution-registry.js";
export type { UiContributionsProviderProps } from "./contributions-context.jsx";
export {
  UiContributionsProvider,
  useUiContributions,
} from "./contributions-context.jsx";
export type { UiCopilotContext } from "./copilot-context.js";
export {
  deriveCopilotContext,
  deriveModuleCopilotContext,
} from "./copilot-context.js";
export type { ResolvedFlags } from "./feature-flags.jsx";
export {
  FeatureFlagsProvider,
  FeatureGate,
  useFeatureFlag,
  useFeatureFlags,
} from "./feature-flags.jsx";
export type {
  AgentsWorkspaceNavRegistration,
  PageBreadcrumb,
  PageContentStackBackground,
  PageTopbarChrome,
} from "./page-config.js";
export {
  PageHeaderProvider,
  useAgentsWorkspaceNavRegistration,
  usePageConfig,
  usePageHeader,
  useSecondaryNavSearchResultsOnly,
} from "./page-config.js";
export { useContributionRegistry } from "./use-contribution-registry.jsx";
export type { WorkspaceTenant } from "./workspace-context.jsx";
export {
  useWorkspaceContext,
  WorkspaceProvider,
} from "./workspace-context.jsx";
