import type {
  PluginCategory,
  PluginPlacement,
  PluginSourceInfo,
} from "@engenty/plugin-sdk";
import type { ComponentType } from "react";

export type {
  PluginCategory,
  PluginDiagnostic,
  PluginPlacement,
  PluginSourceInfo,
  // Space setup (PLAN-spaces.md 3b): the browser gets the pure key helper and
  // the types, but NOT `SPACE_BASELINE_MOUNTS` — the dialog reads the baseline
  // from `GET /api/spaces/setup-catalog` so there is no third copy of a list
  // that SQL and plugin-sdk are already pinned against.
  SpaceMountDeclaration,
  SpaceRecordScopeLevel,
  SpaceResourceKind,
} from "@engenty/plugin-sdk";
export {
  DEFAULT_PLUGIN_PLACEMENT,
  isPluginCategory,
  isPluginPlacement,
  PLUGIN_CATEGORIES,
  PLUGIN_PLACEMENTS,
  pluginCategoryRank,
  SPACE_RESOURCE_KINDS,
  spaceMountKey,
} from "@engenty/plugin-sdk";

export type UiPluginId = string;
export type UiIconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;

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

/** Minimal query client surface used after copilot assistant turns (no TanStack peer here). */
export interface CopilotAssistantTurnFinishQueryClient {
  invalidateQueries: (filters: {
    queryKey?: readonly unknown[];
    predicate?: (query: unknown) => boolean;
  }) => Promise<unknown>;
}

/** Copilot contribution from a module. Resolved by pathname/scope. */
export interface UiCopilotContribution {
  matches: (context: CopilotMatchContext) => boolean;
  moduleId: string;
  /**
   * Called after the copilot's approved action ran on this page (a sandbox
   * command the person approved). Use to invalidate module-owned query caches.
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
  routeKey: string;
  sourceInfo?: PluginSourceInfo;
  starterPrompts?: UiCopilotStarterPrompt[];
  title?: string;
}

export interface UiRouteContribution {
  component: ComponentType;
  id: string;
  order?: number;
  path: string;
  pluginId: UiPluginId;
  /**
   * Whether only tenant admins / superadmins may open this route. Members are
   * bounced to the app root. When omitted, the shell defaults admin surfaces
   * (any `/admin/*` route, and tenant-config `/settings/*` routes outside the
   * personal allowlist) to admin-only; set `false` to expose a personal route
   * under those prefixes to members (e.g. Connections).
   */
  requiresAdmin?: boolean;
  scope?: UiRouteScope;
  sourceInfo?: PluginSourceInfo;
}

export type UiRouteScope = "authenticated" | "public";

export type UiAdminMenuSection = "modules" | "admin";

export interface UiAdminMenuItemContribution {
  /**
   * Catalog group from `engenty.plugin.json` (enriched at UI resolve time).
   * Primary-rail modules section follows {@link PLUGIN_CATEGORIES}; `order`
   * sorts within the category only — same rules as settings items.
   */
  category?: PluginCategory;
  icon?: UiIconComponent;
  id: string;
  label: string;
  labelKey?: string;
  /** Sort key within {@link category} only — not across categories. */
  order?: number;
  parentId?: string;
  /**
   * Shell placement (enriched at UI resolve time from the owning plugin).
   * Decides whether this row belongs on the app rail at all — see
   * {@link PluginPlacement}. Per PLUGIN, so a module registering a parent row
   * plus children moves as a unit.
   */
  placement?: PluginPlacement;
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
  /**
   * Catalog group from `engenty.plugin.json` (enriched at UI resolve time).
   * Category display order is {@link PLUGIN_CATEGORIES}; `order` sorts within
   * the category only.
   */
  category?: PluginCategory;
  icon?: UiIconComponent;
  id: string;
  label: string;
  labelKey?: string;
  /** Sort key within {@link category} only — not across categories. */
  order?: number;
  pluginId: UiPluginId;
  /**
   * Whether this settings row is tenant configuration (admins only) or a
   * personal surface a member may use. Module settings are admin-only by
   * default; set `false` to keep a per-user surface (e.g. Connections) visible
   * to members.
   */
  requiresAdmin?: boolean;
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
 * whenever the app is open.
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

/**
 * A module that promotes itself into the space's Work · Data · … tab strip.
 *
 * Work and Data are the space's own pages and stay host-owned. Everything after
 * them is this contribution: the tab only exists while the plugin is enabled
 * AND the module is mounted in that space, so a space without Tasks has no Plan
 * tab rather than a hardcoded empty one.
 *
 * `id` is the section name (`"plan"`), not a URL segment — the tab still opens
 * `/s/<key>/<moduleId>/…`. `"work"`, `"data"` and `"settings"` are reserved.
 */
export interface UiSpaceTabContribution {
  /**
   * Embed this module's landing page on the Space Home (below the Copilot
   * composer). First mounted tab that opts in wins.
   */
  embedOnHome?: boolean;
  icon?: UiIconComponent;
  id: string;
  label?: string;
  labelKey?: string;
  /**
   * Module this tab opens. Defaults to `pluginId`. Separate only when the
   * plugin id and the mounted module id are not the same string.
   */
  moduleId?: string;
  order?: number;
  /**
   * Path under the module, without a leading slash (`"briefing"` →
   * `/s/<key>/tasks/briefing`). Absent = the module root.
   */
  path?: string;
  pluginId: UiPluginId;
  sourceInfo?: PluginSourceInfo;
}

/** Argument declared by a chat slash command (rendered as a hint; `ref` args open the @-picker). */
export interface UiChatCommandArg {
  labelKey?: string;
  name: string;
  /** Entity key for `ref` args, e.g. `"contacts:contact"` | `"core:user"` | `"artifact"`. */
  refEntity?: string;
  required?: boolean;
  type: "enum" | "ref" | "string";
}

/**
 * A chat slash command a module contributes to the agent-chat composer. Only
 * exists while the contributing plugin is enabled — install-gated for free,
 * like tabs. `ui`-kind commands execute client-side via `frontendTool` (the
 * frontend-tool registry) or a host-provided built-in; `prompt`/`action` kinds
 * are declared server-side (COMMAND.md) and this contribution only decorates
 * them (icon, localized labels).
 */
export interface UiChatCommandContribution {
  args?: UiChatCommandArg[];
  /** Canonical ASCII token the user types after "/", e.g. "create-offer". */
  command: string;
  description?: string;
  descriptionKey?: string;
  /** kind=ui — dispatched through the frontend-tool registry with `{ argsText }`. */
  frontendTool?: string;
  icon?: UiIconComponent;
  id: string;
  kind: "workflow" | "prompt" | "ui";
  label?: string;
  labelKey?: string;
  order?: number;
  pluginId: UiPluginId;
  sourceInfo?: PluginSourceInfo;
  /** Host surface, `"chat"` (default). */
  surface?: string;
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

/** Brand identity a module (e.g. company-profile) surfaces to the app shell. */
export interface UiBrandInfo {
  logoUrl?: string | null;
  name?: string | null;
  tagLine?: string | null;
}

/**
 * A React hook a module contributes so the shell can display the tenant's own
 * brand (name + logo) without the app source-importing the module. Called once
 * per render at the top level — must obey the rules of hooks. Last wins.
 */
export type UiBrandSource = () => UiBrandInfo;

export interface UiContributions {
  adminMenuItems: UiAdminMenuItemContribution[];
  backgroundComponents: UiBackgroundComponentContribution[];
  /**
   * Optional brand-source hook (see {@link UiBrandSource}). Last registration
   * wins, mirroring `copilotArticleHrefResolver`.
   */
  brandSource?: UiBrandSource;
  chatCommands: UiChatCommandContribution[];
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
  /**
   * Plugin-contributed space sections (Plan, …). Optional so contribution
   * snapshots that predate this kind still typecheck; consumers use `?? []`.
   */
  spaceTabs?: UiSpaceTabContribution[];
  tabs: UiTabContribution[];
}

export interface UiPluginSummary {
  capabilities?: {
    ai?: boolean;
    frontendTools?: boolean;
    operations?: boolean;
    ui?: boolean;
  };
  /** Catalog group from engenty.plugin.json — see PluginCategory. */
  category?: PluginCategory;
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
  /** Where the plugin's engenty.plugin.json lives, for diagnostics. */
  manifestPath?: string;
  optional?: string[];
  /** The npm package the plugin ships in, for diagnostics. */
  packageName?: string;
  /** Shell placement from engenty.plugin.json — see PluginPlacement. */
  placement?: PluginPlacement;
  /** Repo-relative plugin root, for diagnostics. */
  rootDir?: string;
  /** Where the plugin lives in the workspace. */
  sourceType?: PluginSourceInfo["sourceType"];
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
  "ui.chatCommands": UiChatCommandContribution[];
  "ui.contributionsResolved": UiContributions;
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
  "ui.spaceTabs": UiSpaceTabContribution[];
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
    /**
     * Overrides the plugin's manifest placement for this one row. A
     * space-placed module uses it for a surface that spans spaces — Tasks'
     * cross-space work overview sits on the app rail while Plan stays inside
     * each space.
     */
    placement?: PluginPlacement;
    useBadgeCount?: () => number | undefined;
  }) => void;
  registerBackgroundComponent: (input: {
    component: ComponentType;
    id: string;
    order?: number;
  }) => void;
  registerBrandSource: (input: { useBrand: UiBrandSource }) => void;
  registerChatCommand: (input: {
    id: string;
    command: string;
    kind: "workflow" | "prompt" | "ui";
    args?: UiChatCommandArg[];
    description?: string;
    descriptionKey?: string;
    frontendTool?: string;
    icon?: UiIconComponent;
    label?: string;
    labelKey?: string;
    order?: number;
    surface?: string;
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
    requiresAdmin?: boolean;
    scope?: UiRouteScope;
  }) => void;
  registerSettingsItem: (input: {
    id: string;
    label: string;
    labelKey?: string;
    to: string;
    icon?: UiIconComponent;
    order?: number;
    requiresAdmin?: boolean;
  }) => void;
  registerSpaceTab: (input: {
    id: string;
    embedOnHome?: boolean;
    icon?: UiIconComponent;
    label?: string;
    labelKey?: string;
    moduleId?: string;
    order?: number;
    path?: string;
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

/**
 * The named half of {@link EngentyPluginsApi}. Split out because the index
 * signature swallows Omit/keyof: `Omit<EngentyPluginsApi, string>` is `{}`,
 * so an implementation typed that way loses every method. Implement THIS,
 * then widen to the indexed shape at the boundary.
 */
export interface EngentyPluginsApiCore {
  expose: (methods: PluginMethodsRecord) => void;
  get: <TMethods extends PluginMethodsRecord = PluginMethodsRecord>(
    pluginId: string
  ) => TMethods | null;
  hasPluginApi: (pluginId: string) => boolean;
  isPluginEnabled: (pluginId: string) => boolean;
  register: (pluginId: string, methods: PluginMethodsRecord) => void;
}

export interface EngentyPluginsApi extends EngentyPluginsApiCore {
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
export type {
  WorkspaceContextValue,
  WorkspaceSpace,
  WorkspaceTenant,
  WorkspaceTenantState,
} from "./workspace-context.jsx";
export {
  useCanAdministerTenant,
  useWorkspaceContext,
  useWorkspaceSpace,
  useWorkspaceTenant,
  WorkspaceProvider,
} from "./workspace-context.jsx";
