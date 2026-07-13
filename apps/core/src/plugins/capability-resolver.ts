import type { PluginDiagnostic } from "@engenty/plugin-sdk";
import type { PrincipalContext } from "../security/auth.js";
import { getMandatoryPluginDeclaration } from "./mandatory-plugins.js";
import type { PluginRecord, PluginRegistry } from "./registry.js";

export type PluginCapabilityBlockedReason =
  | "plugin_not_installed"
  | "plugin_not_loaded"
  | "plugin_globally_disabled"
  | "plugin_tenant_disabled"
  | "package_module_not_licensed"
  | "dependency_missing"
  | "dependency_disabled"
  | "capability_not_registered"
  | "principal_forbidden"
  | "approval_required";

export type PluginEffectiveStateName =
  | "installed"
  | "loaded"
  | "globally_enabled"
  | "tenant_enabled"
  | "dependency_satisfied"
  | "capability_enabled"
  | "blocked";

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
      diagnostics: PluginDiagnostic[];
      pluginId: string;
      reason: PluginCapabilityBlockedReason;
    };

export interface ResolvePluginCapabilityParams {
  capability: string;
  contributionKind: PluginContributionKind;
  /**
   * Commercial-package module allow-list for the tenant. `null`/`undefined`
   * means no package restriction (every module licensed); an array licenses
   * only the listed module ids. Mandatory/core modules are always exempt.
   */
  packageAllowedModules?: string[] | null;
  pluginId: string;
  principal?: PrincipalContext;
  registeredCapabilities?: Iterable<string>;
  registry: PluginRegistry;
  tenantId?: string;
  tenantPluginOverrides?: Record<string, boolean>;
}

export interface PluginDependencyEffectiveState {
  dependency: string;
  pluginId?: string;
  reason?: "dependency_missing" | "dependency_disabled";
  satisfied: boolean;
}

export interface PluginEffectiveState {
  allowed: boolean;
  blockedReasons: PluginCapabilityBlockedReason[];
  capability: string;
  capabilityAvailable: boolean;
  dependencies: PluginDependencyEffectiveState[];
  dependencySatisfied: boolean;
  diagnostics: PluginDiagnostic[];
  globallyEnabled: boolean;
  hostHealthRelevant: boolean;
  installed: boolean;
  loaded: boolean;
  mandatory: boolean;
  mandatoryCapabilities?: readonly string[];
  mandatoryReason?: string;
  pluginId: string;
  state: PluginEffectiveStateName;
  tenantEnabled: boolean;
}

function diagnostic(params: {
  code: string;
  message: string;
  plugin?: PluginRecord;
  pluginId: string;
  remediation: string;
}): PluginDiagnostic {
  return {
    code: params.code,
    level: "warn",
    message: params.message,
    pluginId: params.pluginId,
    remediation: params.remediation,
    sourceInfo: params.plugin?.sourceInfo,
  };
}

function providedCapabilities(plugin: PluginRecord): string[] {
  const provides = plugin.provides ?? [];
  return provides.length > 0 ? provides : [`module.${plugin.id}`, plugin.id];
}

function findDependencyPlugin(
  registry: PluginRegistry,
  dependency: string
): PluginRecord | undefined {
  return registry.plugins.find((plugin) => {
    if (plugin.id === dependency) {
      return true;
    }
    return providedCapabilities(plugin).includes(dependency);
  });
}

function requiredDependencies(plugin: PluginRecord): string[] {
  return plugin.requires ?? plugin.dependencies;
}

function isTenantDisabled(
  pluginId: string,
  tenantPluginOverrides: Record<string, boolean> | undefined
): boolean {
  return tenantPluginOverrides?.[pluginId] === false;
}

/**
 * True when the module is licensed by the tenant's commercial package. A
 * `null`/`undefined` allow-list (no package restriction) or a mandatory/core
 * module is always licensed; otherwise the module id must be in the allow-list.
 */
function isModuleLicensed(
  pluginId: string,
  mandatory: boolean,
  packageAllowedModules: string[] | null | undefined
): boolean {
  if (packageAllowedModules == null || mandatory) {
    return true;
  }
  return packageAllowedModules.includes(pluginId);
}

function stateName(params: {
  capabilityAvailable: boolean;
  dependencySatisfied: boolean;
  globallyEnabled: boolean;
  installed: boolean;
  loaded: boolean;
  tenantEnabled: boolean;
}): PluginEffectiveStateName {
  if (!params.installed) {
    return "blocked";
  }
  if (!params.loaded) {
    return "installed";
  }
  if (!params.globallyEnabled) {
    return "loaded";
  }
  if (!params.tenantEnabled) {
    return "globally_enabled";
  }
  if (!params.dependencySatisfied) {
    return "tenant_enabled";
  }
  if (!params.capabilityAvailable) {
    return "dependency_satisfied";
  }
  return "capability_enabled";
}

export function resolvePluginEffectiveState(
  params: ResolvePluginCapabilityParams
): PluginEffectiveState {
  const mandatoryDeclaration = getMandatoryPluginDeclaration(params.pluginId);
  const plugin = params.registry.plugins.find(
    (item) => item.id === params.pluginId
  );
  if (!plugin) {
    return {
      allowed: false,
      blockedReasons: ["plugin_not_installed"],
      capability: params.capability,
      capabilityAvailable: false,
      dependencies: [],
      dependencySatisfied: false,
      diagnostics: [
        diagnostic({
          code: "plugin.capability.plugin_not_installed",
          message: `Plugin is not installed: ${params.pluginId}`,
          pluginId: params.pluginId,
          remediation:
            "Install the plugin before resolving or invoking its capabilities.",
        }),
      ],
      globallyEnabled: false,
      hostHealthRelevant: Boolean(mandatoryDeclaration),
      installed: false,
      loaded: false,
      mandatory: Boolean(mandatoryDeclaration),
      mandatoryCapabilities: mandatoryDeclaration?.capabilities,
      mandatoryReason: mandatoryDeclaration?.reason,
      pluginId: params.pluginId,
      state: "blocked",
      tenantEnabled: false,
    };
  }

  const blockedReasons: PluginCapabilityBlockedReason[] = [];
  const dependencies: PluginDependencyEffectiveState[] = [];
  const diagnostics: PluginDiagnostic[] = [];
  const loaded = plugin.loaded;
  const globallyEnabled = plugin.enabled;
  const tenantEnabled = !isTenantDisabled(
    plugin.id,
    params.tenantPluginOverrides
  );

  if (!loaded) {
    blockedReasons.push("plugin_not_loaded");
    diagnostics.push(
      diagnostic({
        code: "plugin.capability.plugin_not_loaded",
        message: `Plugin is not loaded: ${plugin.id}`,
        plugin,
        pluginId: plugin.id,
        remediation:
          "Fix plugin load diagnostics and restart the host if required.",
      })
    );
  }

  if (!globallyEnabled) {
    blockedReasons.push("plugin_globally_disabled");
    diagnostics.push(
      diagnostic({
        code: "plugin.capability.plugin_globally_disabled",
        message: `Plugin is globally disabled: ${plugin.id}`,
        plugin,
        pluginId: plugin.id,
        remediation: "Enable the plugin globally and restart the host.",
      })
    );
  }

  if (!tenantEnabled) {
    blockedReasons.push("plugin_tenant_disabled");
    diagnostics.push(
      diagnostic({
        code: "plugin.capability.plugin_tenant_disabled",
        message: `Plugin is disabled for tenant: ${plugin.id}`,
        plugin,
        pluginId: plugin.id,
        remediation:
          "Enable the plugin for this tenant before invoking the capability.",
      })
    );
  }

  const moduleLicensed = isModuleLicensed(
    plugin.id,
    Boolean(mandatoryDeclaration),
    params.packageAllowedModules
  );
  if (!moduleLicensed) {
    blockedReasons.push("package_module_not_licensed");
    diagnostics.push(
      diagnostic({
        code: "plugin.capability.package_module_not_licensed",
        message: `Module is not licensed by the tenant's package: ${plugin.id}`,
        plugin,
        pluginId: plugin.id,
        remediation:
          "Assign a commercial package that includes this module, or add it to the tenant's entitlement override.",
      })
    );
  }

  for (const dependency of requiredDependencies(plugin)) {
    const dependencyPlugin = findDependencyPlugin(params.registry, dependency);
    if (!dependencyPlugin) {
      blockedReasons.push("dependency_missing");
      dependencies.push({
        dependency,
        reason: "dependency_missing",
        satisfied: false,
      });
      diagnostics.push(
        diagnostic({
          code: "plugin.dependency.missing_required",
          message: `Required dependency is missing for ${plugin.id}: ${dependency}`,
          plugin,
          pluginId: plugin.id,
          remediation:
            "Install and load the required dependency or remove the declared requirement.",
        })
      );
      continue;
    }

    if (
      !(dependencyPlugin.loaded && dependencyPlugin.enabled) ||
      isTenantDisabled(dependencyPlugin.id, params.tenantPluginOverrides)
    ) {
      blockedReasons.push("dependency_disabled");
      dependencies.push({
        dependency,
        pluginId: dependencyPlugin.id,
        reason: "dependency_disabled",
        satisfied: false,
      });
      diagnostics.push(
        diagnostic({
          code: "plugin.dependency.disabled_required",
          message: `Required dependency is unavailable for ${plugin.id}: ${dependency}`,
          plugin,
          pluginId: plugin.id,
          remediation:
            "Enable the required dependency globally and for this tenant before invoking the dependent capability.",
        })
      );
      continue;
    }

    dependencies.push({
      dependency,
      pluginId: dependencyPlugin.id,
      satisfied: true,
    });
  }

  const registered = params.registeredCapabilities
    ? new Set(params.registeredCapabilities)
    : null;
  const capabilityAvailable = !(
    registered && !registered.has(params.capability)
  );
  if (!capabilityAvailable) {
    blockedReasons.push("capability_not_registered");
    diagnostics.push(
      diagnostic({
        code: "plugin.capability.not_registered",
        message: `Capability is not registered by plugin ${plugin.id}: ${params.capability}`,
        plugin,
        pluginId: plugin.id,
        remediation:
          "Register the capability from the owning plugin before resolving it.",
      })
    );
  }

  const dependencySatisfied = dependencies.every((entry) => entry.satisfied);
  const allowed =
    loaded &&
    globallyEnabled &&
    tenantEnabled &&
    moduleLicensed &&
    dependencySatisfied &&
    capabilityAvailable;

  return {
    allowed,
    blockedReasons: Array.from(new Set(blockedReasons)),
    capability: params.capability,
    capabilityAvailable,
    dependencies,
    dependencySatisfied,
    diagnostics,
    globallyEnabled,
    hostHealthRelevant: Boolean(mandatoryDeclaration && !allowed),
    installed: true,
    loaded,
    mandatory: Boolean(mandatoryDeclaration),
    mandatoryCapabilities: mandatoryDeclaration?.capabilities,
    mandatoryReason: mandatoryDeclaration?.reason,
    pluginId: plugin.id,
    state: allowed
      ? "capability_enabled"
      : moduleLicensed
        ? stateName({
            capabilityAvailable,
            dependencySatisfied,
            globallyEnabled,
            installed: true,
            loaded,
            tenantEnabled,
          })
        : "blocked",
    tenantEnabled,
  };
}

export { resolvePluginCapability } from "@engenty/plugin-sdk";
