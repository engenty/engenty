export interface PluginCapabilityDiagnostic {
  code: string;
  level: "error" | "info" | "warn";
  message: string;
  pluginId?: string;
  remediation?: string;
}

export type PluginCapabilityBlockedReason =
  | "plugin_not_installed"
  | "plugin_not_loaded"
  | "plugin_globally_disabled"
  | "plugin_tenant_disabled"
  | "dependency_missing"
  | "dependency_disabled"
  | "capability_not_registered"
  | "principal_forbidden"
  | "approval_required";

export type PluginContributionKind =
  | "ai"
  | "event_listener"
  | "frontend_tool"
  | "http_route"
  | "mcp_tool"
  | "operation"
  | "queue"
  | "route"
  | "service"
  | "ui_contribution";

export type PluginCapabilityResolution =
  | {
      allowed: true;
      capability: string;
      pluginId: string;
      state: "capability_enabled";
    }
  | {
      allowed: false;
      capability: string;
      diagnostics: PluginCapabilityDiagnostic[];
      pluginId: string;
      reason: PluginCapabilityBlockedReason;
    };

export interface PluginCapabilityRecord {
  dependencies?: string[];
  enabled: boolean;
  id: string;
  loaded: boolean;
  provides?: string[];
  requires?: string[];
}

export interface PluginCapabilityRegistry {
  diagnostics: PluginCapabilityDiagnostic[];
  plugins: PluginCapabilityRecord[];
}

export interface ResolvePluginCapabilityParams {
  capability: string;
  contributionKind: PluginContributionKind;
  pluginId: string;
  registeredCapabilities?: Iterable<string>;
  registry: PluginCapabilityRegistry;
  tenantId?: string;
  tenantPluginOverrides?: Record<string, boolean>;
}

function diagnostic(params: {
  code: string;
  message: string;
  plugin?: PluginCapabilityRecord;
  pluginId: string;
  remediation: string;
}): PluginCapabilityDiagnostic {
  return {
    code: params.code,
    level: "warn",
    message: params.message,
    pluginId: params.pluginId,
    remediation: params.remediation,
  };
}

function providedCapabilities(plugin: PluginCapabilityRecord): string[] {
  const provides = plugin.provides ?? [];
  return provides.length > 0 ? provides : [`module.${plugin.id}`, plugin.id];
}

function findDependencyPlugin(
  registry: PluginCapabilityRegistry,
  dependency: string
): PluginCapabilityRecord | undefined {
  return registry.plugins.find((plugin) => {
    if (plugin.id === dependency) {
      return true;
    }
    return providedCapabilities(plugin).includes(dependency);
  });
}

function requiredDependencies(plugin: PluginCapabilityRecord): string[] {
  return plugin.requires ?? plugin.dependencies ?? [];
}

function isTenantDisabled(
  pluginId: string,
  tenantPluginOverrides: Record<string, boolean> | undefined
): boolean {
  return tenantPluginOverrides?.[pluginId] === false;
}

export function resolvePluginCapability(
  params: ResolvePluginCapabilityParams
): PluginCapabilityResolution {
  const plugin = params.registry.plugins.find(
    (item) => item.id === params.pluginId
  );
  if (!plugin) {
    return {
      allowed: false,
      capability: params.capability,
      pluginId: params.pluginId,
      reason: "plugin_not_installed",
      diagnostics: [
        diagnostic({
          code: "plugin.capability.plugin_not_installed",
          message: `Plugin is not installed: ${params.pluginId}`,
          pluginId: params.pluginId,
          remediation:
            "Install the plugin before resolving or invoking its capabilities.",
        }),
      ],
    };
  }

  if (!plugin.loaded) {
    return {
      allowed: false,
      capability: params.capability,
      pluginId: plugin.id,
      reason: "plugin_not_loaded",
      diagnostics: [
        diagnostic({
          code: "plugin.capability.plugin_not_loaded",
          message: `Plugin is not loaded: ${plugin.id}`,
          plugin,
          pluginId: plugin.id,
          remediation:
            "Fix plugin load diagnostics and restart the host if required.",
        }),
      ],
    };
  }

  if (!plugin.enabled) {
    return {
      allowed: false,
      capability: params.capability,
      pluginId: plugin.id,
      reason: "plugin_globally_disabled",
      diagnostics: [
        diagnostic({
          code: "plugin.capability.plugin_globally_disabled",
          message: `Plugin is globally disabled: ${plugin.id}`,
          plugin,
          pluginId: plugin.id,
          remediation: "Enable the plugin globally and restart the host.",
        }),
      ],
    };
  }

  if (isTenantDisabled(plugin.id, params.tenantPluginOverrides)) {
    return {
      allowed: false,
      capability: params.capability,
      pluginId: plugin.id,
      reason: "plugin_tenant_disabled",
      diagnostics: [
        diagnostic({
          code: "plugin.capability.plugin_tenant_disabled",
          message: `Plugin is disabled for tenant: ${plugin.id}`,
          plugin,
          pluginId: plugin.id,
          remediation:
            "Enable the plugin for this tenant before invoking the capability.",
        }),
      ],
    };
  }

  const registered = params.registeredCapabilities
    ? new Set(params.registeredCapabilities)
    : null;
  if (registered && !registered.has(params.capability)) {
    return {
      allowed: false,
      capability: params.capability,
      pluginId: plugin.id,
      reason: "capability_not_registered",
      diagnostics: [
        diagnostic({
          code: "plugin.capability.not_registered",
          message: `Capability is not registered by plugin ${plugin.id}: ${params.capability}`,
          plugin,
          pluginId: plugin.id,
          remediation:
            "Register the capability from the owning plugin before resolving it.",
        }),
      ],
    };
  }

  for (const dependency of requiredDependencies(plugin)) {
    const dependencyPlugin = findDependencyPlugin(params.registry, dependency);
    if (!dependencyPlugin) {
      return {
        allowed: false,
        capability: params.capability,
        pluginId: plugin.id,
        reason: "dependency_missing",
        diagnostics: [
          diagnostic({
            code: "plugin.dependency.missing_required",
            message: `Required dependency is missing for ${plugin.id}: ${dependency}`,
            plugin,
            pluginId: plugin.id,
            remediation:
              "Install and load the required dependency or remove the declared requirement.",
          }),
        ],
      };
    }

    if (
      !(dependencyPlugin.loaded && dependencyPlugin.enabled) ||
      isTenantDisabled(dependencyPlugin.id, params.tenantPluginOverrides)
    ) {
      return {
        allowed: false,
        capability: params.capability,
        pluginId: plugin.id,
        reason: "dependency_disabled",
        diagnostics: [
          diagnostic({
            code: "plugin.dependency.disabled_required",
            message: `Required dependency is unavailable for ${plugin.id}: ${dependency}`,
            plugin,
            pluginId: plugin.id,
            remediation:
              "Enable the required dependency globally and for this tenant before invoking the dependent capability.",
          }),
        ],
      };
    }
  }

  return {
    allowed: true,
    capability: params.capability,
    pluginId: plugin.id,
    state: "capability_enabled",
  };
}
