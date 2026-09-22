import type {
  EngentyPluginsApi,
  EngentyPluginsApiCore,
  EngentyUiApi,
  PluginMethodsRecord,
  PluginSourceInfo,
  UiAdminMenuItemContribution,
  UiBackgroundComponentContribution,
  UiBrandSource,
  UiChatCommandContribution,
  UiContributions,
  UiCopilotContribution,
  UiDashboardWidgetContribution,
  UiDevelopmentPanelContribution,
  UiEventMap,
  UiI18nNamespaceContribution,
  UiLiveBindingContribution,
  UiNavigationPrefetchContribution,
  UiRouteContribution,
  UiRouteScope,
  UiSettingsItemContribution,
  UiSpaceTabContribution,
  UiTabContribution,
} from "@engenty/ui-plugin-sdk";
import { createHookEngine } from "./hook-engine";

interface MutableUiContributions {
  adminMenuItems: UiAdminMenuItemContribution[];
  backgroundComponents: UiBackgroundComponentContribution[];
  brandSource?: UiBrandSource;
  chatCommands: UiChatCommandContribution[];
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
  spaceTabs: UiSpaceTabContribution[];
  tabs: UiTabContribution[];
}

function normalizeId(value: string, kind: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${kind} id is required`);
  }
  return normalized;
}

function normalizePath(value: string, kind: string) {
  const normalized = value.trim();
  if (!normalized.startsWith("/")) {
    throw new Error(`${kind} path must start with "/"`);
  }
  return normalized;
}

function normalizeRouteScope(value: UiRouteScope | undefined) {
  if (value === undefined || value === "authenticated" || value === "public") {
    return value;
  }
  throw new Error(`route scope must be "authenticated" or "public"`);
}

function sourceInfoFor(
  sourceInfo: PluginSourceInfo | undefined,
  registrationKind: string
): PluginSourceInfo | undefined {
  if (!sourceInfo) {
    return;
  }
  return {
    ...sourceInfo,
    registrationKind,
  };
}

export interface UiPluginRuntime {
  contributions: MutableUiContributions;
  enabledPluginIds: Set<string>;
  hooks: ReturnType<typeof createHookEngine<UiEventMap>>;
  pluginMethodsById: Map<string, PluginMethodsRecord>;
}

function normalizePluginId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  const noScope = trimmed.includes("/")
    ? (trimmed.split("/").pop() ?? trimmed)
    : trimmed;
  return noScope.replace(/^@/, "");
}

export function createUiPluginRuntime(
  enabledPluginIds: Set<string> = new Set()
): UiPluginRuntime {
  return {
    contributions: {
      routes: [],
      adminMenuItems: [],
      backgroundComponents: [],
      brandSource: undefined,
      copilotArticleHrefResolver: undefined,
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
    },
    hooks: createHookEngine<UiEventMap>(),
    enabledPluginIds,
    pluginMethodsById: new Map(),
  };
}

export function createEngentyPluginsApi(
  pluginId: string,
  runtime: UiPluginRuntime
): EngentyPluginsApi {
  const normalizedPluginId = normalizePluginId(pluginId);

  const core: EngentyPluginsApiCore = {
    expose: (methods) => {
      runtime.pluginMethodsById.set(normalizedPluginId, methods);
    },
    register: (targetPluginId, methods) => {
      const normalizedTarget = normalizePluginId(targetPluginId);
      runtime.pluginMethodsById.set(normalizedTarget, methods);
    },
    hasPluginApi: (targetPluginId) => {
      const normalizedTarget = normalizePluginId(targetPluginId);
      return runtime.pluginMethodsById.has(normalizedTarget);
    },
    isPluginEnabled: (targetPluginId) => {
      const normalizedTarget = normalizePluginId(targetPluginId);
      return runtime.enabledPluginIds.has(normalizedTarget);
    },
    get: <TMethods extends PluginMethodsRecord = PluginMethodsRecord>(
      targetPluginId: string
    ) => {
      const normalizedTarget = normalizePluginId(targetPluginId);
      if (!runtime.enabledPluginIds.has(normalizedTarget)) {
        return null;
      }
      // The store is untyped by design; the generic is the caller's claim.
      return (runtime.pluginMethodsById.get(normalizedTarget) ??
        null) as TMethods | null;
    },
  };

  return new Proxy(core as EngentyPluginsApi, {
    get(target, prop, receiver) {
      if (typeof prop !== "string") {
        return Reflect.get(target, prop, receiver);
      }
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      return core.get(prop);
    },
  });
}

export function createEngentyUiApi(
  pluginId: string,
  runtime: UiPluginRuntime,
  catalogSourceInfo?: PluginSourceInfo
): EngentyUiApi {
  const normalizedPluginId = normalizeId(pluginId, "plugin");

  return {
    registerRoute: (input) => {
      const id = normalizeId(input.id, "route");
      const path = normalizePath(input.path, "route");
      runtime.contributions.routes.push({
        id,
        pluginId: normalizedPluginId,
        path,
        component: input.component,
        order: input.order,
        requiresAdmin: input.requiresAdmin,
        scope: normalizeRouteScope(input.scope),
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.route"),
      });
    },
    registerAdminMenuItem: (input) => {
      const id = normalizeId(input.id, "admin menu");
      runtime.contributions.adminMenuItems.push({
        id,
        pluginId: normalizedPluginId,
        section: input.section,
        label: input.label.trim(),
        labelKey: input.labelKey?.trim(),
        to: normalizePath(input.to, "admin menu"),
        icon: input.icon,
        parentId: input.parentId?.trim(),
        order: input.order,
        placement: input.placement,
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.adminMenuItem"),
        useBadgeCount: input.useBadgeCount,
      });
    },
    registerSettingsItem: (input) => {
      const id = normalizeId(input.id, "settings item");
      runtime.contributions.settingsItems.push({
        id,
        pluginId: normalizedPluginId,
        label: input.label.trim(),
        labelKey: input.labelKey?.trim(),
        to: normalizePath(input.to, "settings item"),
        icon: input.icon,
        order: input.order,
        requiresAdmin: input.requiresAdmin,
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.settingsItem"),
      });
    },
    registerTab: (input) => {
      const id = normalizeId(input.id, "tab");
      const surface = normalizeId(input.surface, "tab surface");
      runtime.contributions.tabs.push({
        id,
        pluginId: normalizedPluginId,
        surface,
        component: input.component,
        label: input.label?.trim(),
        labelKey: input.labelKey?.trim(),
        icon: input.icon,
        order: input.order,
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.tab"),
      });
    },
    registerSpaceTab: (input) => {
      const id = normalizeId(input.id, "space tab");
      const rest = input.path?.trim().replace(/^\/+/, "");
      runtime.contributions.spaceTabs.push({
        id,
        pluginId: normalizedPluginId,
        ...(input.embedOnHome ? { embedOnHome: true } : {}),
        icon: input.icon,
        label: input.label?.trim(),
        labelKey: input.labelKey?.trim(),
        moduleId: input.moduleId?.trim() || undefined,
        order: input.order,
        ...(rest ? { path: rest } : {}),
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.spaceTab"),
      });
    },
    registerChatCommand: (input) => {
      const id = normalizeId(input.id, "chat command");
      runtime.contributions.chatCommands.push({
        id,
        pluginId: normalizedPluginId,
        command: input.command.trim().toLowerCase(),
        kind: input.kind,
        args: input.args,
        description: input.description?.trim(),
        descriptionKey: input.descriptionKey?.trim(),
        frontendTool: input.frontendTool?.trim(),
        icon: input.icon,
        label: input.label?.trim(),
        labelKey: input.labelKey?.trim(),
        order: input.order,
        surface: input.surface?.trim() || "chat",
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.chatCommand"),
      });
    },
    registerBrandSource: (input) => {
      // Last registration wins, mirroring a single-value contribution.
      runtime.contributions.brandSource = input.useBrand;
    },
    registerCopilotArticleHrefResolver: (input) => {
      // Last registration wins, mirroring a single-value contribution.
      runtime.contributions.copilotArticleHrefResolver = input.resolve;
    },
    registerCopilotContribution: (input) => {
      runtime.contributions.copilotContributions.push({
        ...input,
        moduleId: normalizeId(input.moduleId, "copilot module"),
        pluginId: normalizedPluginId,
        routeKey: input.routeKey.trim() || "enhance",
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.copilotContribution"),
      });
    },
    registerBackgroundComponent: (input) => {
      const id = normalizeId(input.id, "background component");
      runtime.contributions.backgroundComponents.push({
        id,
        pluginId: normalizedPluginId,
        component: input.component,
        order: input.order,
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.backgroundComponent"),
      });
    },
    registerDashboardWidget: (input) => {
      const id = normalizeId(input.id, "dashboard widget");
      runtime.contributions.dashboardWidgets.push({
        id,
        pluginId: normalizedPluginId,
        title: input.title.trim(),
        category: input.category?.trim(),
        component: input.component,
        configSchema: input.configSchema,
        createDefaultConfig: input.createDefaultConfig,
        defaultSize: input.defaultSize,
        description: input.description?.trim(),
        order: input.order,
        starterPriority: input.starterPriority,
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.dashboardWidget"),
      });
    },
    registerNavigationPrefetch: (input) => {
      const id = normalizeId(input.id, "navigation prefetch");
      runtime.contributions.navigationPrefetch.push({
        id,
        pluginId: normalizedPluginId,
        match: input.match,
        order: input.order,
        prefetch: input.prefetch,
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.navigationPrefetch"),
      });
    },
    registerDevelopmentPanel: (input) => {
      const id = normalizeId(input.id, "development panel");
      runtime.contributions.developmentPanels.push({
        id,
        pluginId: normalizedPluginId,
        title: input.title.trim(),
        component: input.component,
        order: input.order,
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.developmentPanel"),
      });
    },
    registerI18nNamespace: (input) => {
      const namespace = normalizeId(input.namespace, "i18n namespace");
      runtime.contributions.i18nNamespaces.push({
        namespace,
        pluginId: normalizedPluginId,
        loaders: input.loaders,
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.i18nNamespace"),
      });
    },
    registerLiveBinding: (input) => {
      const id = normalizeId(input.id, "live binding");
      runtime.contributions.liveBindings.push({
        id,
        pluginId: normalizedPluginId,
        queryRoot: input.queryRoot,
        ...(input.postgresChanges
          ? { postgresChanges: input.postgresChanges }
          : {}),
        ...(input.agentToolIds ? { agentToolIds: input.agentToolIds } : {}),
        sourceInfo: sourceInfoFor(catalogSourceInfo, "ui.liveBinding"),
      });
    },
    on: (event, handler) => runtime.hooks.on(event, handler),
  };
}

export async function resolveUiContributions(
  runtime: UiPluginRuntime
): Promise<UiContributions> {
  const [
    routes,
    adminMenuItems,
    backgroundComponents,
    copilotContributions,
    dashboardWidgets,
    developmentPanels,
    i18nNamespaces,
    liveBindings,
    navigationPrefetch,
    settingsItems,
    spaceTabs,
    tabs,
    chatCommands,
  ] = await Promise.all([
    runtime.hooks.emit("ui.routes", [...runtime.contributions.routes]),
    runtime.hooks.emit("ui.adminMenuItems", [
      ...runtime.contributions.adminMenuItems,
    ]),
    runtime.hooks.emit("ui.backgroundComponents", [
      ...runtime.contributions.backgroundComponents,
    ]),
    runtime.hooks.emit("ui.copilotContributions", [
      ...runtime.contributions.copilotContributions,
    ]),
    runtime.hooks.emit("ui.dashboardWidgets", [
      ...runtime.contributions.dashboardWidgets,
    ]),
    runtime.hooks.emit("ui.developmentPanels", [
      ...runtime.contributions.developmentPanels,
    ]),
    runtime.hooks.emit("ui.i18nNamespaces", [
      ...runtime.contributions.i18nNamespaces,
    ]),
    runtime.hooks.emit("ui.liveBindings", [
      ...runtime.contributions.liveBindings,
    ]),
    runtime.hooks.emit("ui.navigationPrefetch", [
      ...runtime.contributions.navigationPrefetch,
    ]),
    runtime.hooks.emit("ui.settingsItems", [
      ...runtime.contributions.settingsItems,
    ]),
    runtime.hooks.emit("ui.spaceTabs", [...runtime.contributions.spaceTabs]),
    runtime.hooks.emit("ui.tabs", [...runtime.contributions.tabs]),
    runtime.hooks.emit("ui.chatCommands", [
      ...runtime.contributions.chatCommands,
    ]),
  ]);

  const resolved = {
    routes,
    adminMenuItems,
    backgroundComponents,
    brandSource: runtime.contributions.brandSource,
    chatCommands,
    copilotArticleHrefResolver:
      runtime.contributions.copilotArticleHrefResolver,
    copilotContributions,
    dashboardWidgets,
    developmentPanels,
    i18nNamespaces,
    liveBindings,
    navigationPrefetch,
    settingsItems,
    spaceTabs,
    tabs,
  };
  void runtime.hooks.emit("ui.contributionsResolved", resolved);
  return resolved;
}
