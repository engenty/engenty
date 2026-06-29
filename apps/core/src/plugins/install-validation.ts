import fs from "node:fs";
import path from "node:path";
import type { PluginDiagnostic } from "@engenty/plugin-sdk";
import { getMandatoryPluginDeclaration } from "./mandatory-plugins.js";
import { loadPluginManifest, type PluginManifest } from "./manifest.js";
import type { PluginRecord, PluginRegistry } from "./registry.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engenty?: {
    migrationsDir?: string;
    trust?: {
      approved?: boolean;
      checksum?: string;
      level?: string;
    };
  };
  exports?: unknown;
  name?: string;
  private?: boolean;
  version?: string;
}

const TOOLING_DEV_DEPENDENCIES = new Set([
  "tsup",
  "tsx",
  "typescript",
  "vitest",
]);

const COMPILED_ARTIFACT_EXTENSIONS = new Set([".cjs", ".js", ".mjs"]);
const PLUGIN_CSS_LAYER_PATTERN = /@layer\s+engenty\.plugins\b/;
const TAILWIND_GLOBAL_BUNDLE_CSS_PATTERN =
  /@(?:import\s+["']tailwindcss["']|tailwind\s+(?:base|components)\b)/;

export type PluginInstallIssueLevel = "error" | "info" | "warn";

export interface PluginInstallValidationIssue {
  code: string;
  level: PluginInstallIssueLevel;
  message: string;
  path?: string;
  remediation?: string;
}

export interface PluginTrustDecision {
  allowed: boolean;
  level: "approved" | "blocked" | "first_party" | "workspace";
  reason: string;
}

export interface PluginInstallValidationReport {
  hostHealthRelevant: boolean;
  installable: boolean;
  issues: PluginInstallValidationIssue[];
  mandatory: boolean;
  mandatoryCapabilities?: readonly string[];
  mandatoryReason?: string;
  manifest?: PluginManifest;
  manifestPath?: string;
  migrationReviewRequired: boolean;
  packageName?: string;
  pluginId?: string;
  rootDir: string;
  sourceType: PluginRecord["sourceType"];
  trust: PluginTrustDecision;
}

export interface PluginUninstallValidationReport {
  hostHealthRelevant: boolean;
  issues: PluginInstallValidationIssue[];
  mandatory: boolean;
  mandatoryCapabilities?: readonly string[];
  mandatoryReason?: string;
  pluginId: string;
  removableAtRuntime: boolean;
  requiresRestart: boolean;
}

export interface PluginReloadPlanStep {
  description: string;
  implemented: boolean;
  key: string;
}

export interface PluginReloadValidationReport {
  executionAvailable: boolean;
  generationId?: number;
  hostHealthRelevant: boolean;
  issues: PluginInstallValidationIssue[];
  mandatory: boolean;
  mandatoryCapabilities?: readonly string[];
  mandatoryReason?: string;
  nextGenerationId?: number;
  ownedRegistrations: Record<string, number>;
  pluginId: string;
  preflightPassed: boolean;
  requiresRestart: boolean;
  steps: PluginReloadPlanStep[];
}

export function installValidationIssuesToDiagnostics(
  report: PluginInstallValidationReport
): PluginDiagnostic[] {
  return report.issues.map((issue) => ({
    code: issue.code,
    level: issue.level,
    message: issue.message,
    pluginId: report.pluginId,
    remediation: issue.remediation,
  }));
}

function pluginProvides(plugin: PluginRecord) {
  return new Set([
    plugin.id,
    `module.${plugin.id}`,
    ...(plugin.provides ?? []),
  ]);
}

function isNonReloadableService(
  service: PluginRegistry["services"][number]["service"]
) {
  return service.reloadable === false || !service.stop;
}

function isStaleEntryGeneration(
  registry: PluginRegistry,
  entry: { sourceInfo?: { generationId?: number; pluginId?: string } }
) {
  const entryGeneration = entry.sourceInfo?.generationId;
  const pluginId = entry.sourceInfo?.pluginId;
  if (typeof entryGeneration !== "number") {
    return false;
  }
  if (!pluginId) {
    return (
      typeof registry.generationId === "number" &&
      entryGeneration !== registry.generationId
    );
  }
  const pluginRecord = registry.plugins.find((p) => p.id === pluginId);
  const activeGenerationId =
    pluginRecord?.generationId ?? registry.generationId;
  return (
    typeof activeGenerationId === "number" &&
    entryGeneration !== activeGenerationId
  );
}

function countArrayEntriesByPluginId<T extends { pluginId?: string }>(
  entries: T[] | undefined,
  pluginId: string
) {
  return entries?.filter((entry) => entry.pluginId === pluginId).length ?? 0;
}

function countQueueHandlersByPluginId(
  handlers: PluginRegistry["queueHandlers"],
  pluginId: string
) {
  let count = 0;
  for (const entry of handlers.values()) {
    if (entry.pluginId === pluginId) {
      count += 1;
    }
  }
  return count;
}

function countOwnedRegistrations(registry: PluginRegistry, pluginId: string) {
  return {
    aiRegistrations: countArrayEntriesByPluginId(
      registry.aiRegistrations,
      pluginId
    ),
    cliRegistrars: countArrayEntriesByPluginId(
      registry.cliRegistrars,
      pluginId
    ),
    eventFilters: countArrayEntriesByPluginId(registry.eventFilters, pluginId),
    eventInterceptors: countArrayEntriesByPluginId(
      registry.eventInterceptors,
      pluginId
    ),
    eventListeners: countArrayEntriesByPluginId(
      registry.eventListeners,
      pluginId
    ),
    featureFlags: countArrayEntriesByPluginId(registry.featureFlags, pluginId),
    gatewayMethods: countArrayEntriesByPluginId(
      registry.gatewayMethods,
      pluginId
    ),
    httpRoutes: countArrayEntriesByPluginId(registry.httpRoutes, pluginId),
    moduleOperations: countArrayEntriesByPluginId(
      registry.moduleOperations,
      pluginId
    ),
    profilePolicies: countArrayEntriesByPluginId(
      registry.profilePolicies,
      pluginId
    ),
    queueDefinitions: countArrayEntriesByPluginId(
      registry.queueDefinitions,
      pluginId
    ),
    queueHandlers: countQueueHandlersByPluginId(
      registry.queueHandlers,
      pluginId
    ),
    resultPolicies: countArrayEntriesByPluginId(
      registry.resultPolicies,
      pluginId
    ),
    services: countArrayEntriesByPluginId(registry.services, pluginId),
    testDataTypes: countArrayEntriesByPluginId(
      registry.testDataTypes,
      pluginId
    ),
  };
}

function pushStaleGenerationIssue(params: {
  issues: PluginInstallValidationIssue[];
  label: string;
}) {
  pushIssue(params.issues, {
    code: "plugin.runtime.stale_generation",
    level: "error",
    message: `Owned runtime registration belongs to a stale generation: ${params.label}`,
    remediation:
      "Restart the API or wait for the active generation to settle before reload.",
  });
}

function staleOwnedEntries<
  T extends { pluginId?: string; sourceInfo?: unknown },
>(registry: PluginRegistry, pluginId: string, entries: T[] | undefined) {
  return (
    entries?.filter(
      (entry) =>
        entry.pluginId === pluginId &&
        isStaleEntryGeneration(
          registry,
          entry as { sourceInfo?: { generationId?: number } }
        )
    ) ?? []
  );
}

export function validatePluginReload(params: {
  pluginId: string;
  registry: PluginRegistry;
}): PluginReloadValidationReport {
  const issues: PluginInstallValidationIssue[] = [];
  const plugin = params.registry.plugins.find(
    (entry) => entry.id === params.pluginId
  );
  const steps: PluginReloadPlanStep[] = [
    {
      key: "emit_shutdown",
      description: "Emit plugin shutdown event for the plugin.",
      implemented: true,
    },
    {
      key: "stop_services",
      description: "Stop owned reloadable services.",
      implemented: true,
    },
    {
      key: "remove_owned_registrations",
      description: "Remove owner-tracked backend registrations.",
      implemented: true,
    },
    {
      key: "unregister_ai",
      description:
        "Unregister owned AI registrations for the plugin generation.",
      implemented: true,
    },
    {
      key: "clear_import_cache",
      description: "Clear import cache for the plugin root.",
      implemented: true,
    },
    {
      key: "reload_factory",
      description: "Reload manifest and plugin factory.",
      implemented: true,
    },
    {
      key: "refresh_ui",
      description: "Mark UI contributions for client invalidation.",
      implemented: true,
    },
  ];

  if (!plugin) {
    const mandatoryDeclaration = getMandatoryPluginDeclaration(params.pluginId);
    return {
      executionAvailable: false,
      hostHealthRelevant: Boolean(mandatoryDeclaration),
      issues: [
        {
          code: "plugin.reload.plugin_missing",
          level: "error",
          message: `Plugin is not installed: ${params.pluginId}`,
          remediation: "Refresh plugin discovery before retrying reload.",
        },
      ],
      mandatory: Boolean(mandatoryDeclaration),
      mandatoryCapabilities: mandatoryDeclaration?.capabilities,
      mandatoryReason: mandatoryDeclaration?.reason,
      ownedRegistrations: {},
      pluginId: params.pluginId,
      preflightPassed: false,
      requiresRestart: false,
      steps,
    };
  }
  const mandatoryDeclaration = getMandatoryPluginDeclaration(plugin.id);

  if (!plugin.loaded) {
    pushIssue(issues, {
      code: "plugin.reload.plugin_not_loaded",
      level: "error",
      message: `Plugin is not loaded: ${plugin.id}`,
      remediation: "Fix the load error and restart before retrying reload.",
    });
  }

  if (!fs.existsSync(plugin.source)) {
    pushIssue(issues, {
      code: "plugin.reload.source_missing",
      level: "error",
      message: `Plugin source entry is missing: ${plugin.source}`,
      path: plugin.source,
      remediation:
        "Build the package or update engenty.plugin.json server.entry.",
    });
  }

  for (const entry of params.registry.services.filter(
    (serviceEntry) => serviceEntry.pluginId === plugin.id
  )) {
    if (isNonReloadableService(entry.service)) {
      pushIssue(issues, {
        code: "plugin.reload.non_reloadable_service",
        level: "error",
        message: `Owned service cannot be stopped at runtime: ${entry.service.id}`,
        remediation:
          "Add a stop handler and mark the service reloadable, or restart the API.",
      });
    }
    if (isStaleEntryGeneration(params.registry, entry)) {
      pushIssue(issues, {
        code: "plugin.runtime.stale_generation",
        level: "error",
        message: `Owned service belongs to a stale generation: ${entry.service.id}`,
        remediation:
          "Restart the API or wait for the active generation to settle before reload.",
      });
    }
  }

  for (const entry of staleOwnedEntries(
    params.registry,
    plugin.id,
    params.registry.moduleOperations
  )) {
    pushStaleGenerationIssue({
      issues,
      label: `module operation ${entry.operationId}`,
    });
  }
  for (const entry of staleOwnedEntries(
    params.registry,
    plugin.id,
    params.registry.gatewayMethods
  )) {
    pushStaleGenerationIssue({
      issues,
      label: `gateway method ${entry.method.name}`,
    });
  }
  for (const [queueName, entry] of params.registry.queueHandlers) {
    if (
      entry.pluginId === plugin.id &&
      isStaleEntryGeneration(params.registry, entry)
    ) {
      pushStaleGenerationIssue({
        issues,
        label: `queue handler ${queueName}`,
      });
    }
  }

  if (plugin.ui?.entry) {
    pushIssue(issues, {
      code: "plugin.reload.ui_refresh_required",
      level: "warn",
      message:
        "Plugin has UI contributions; UI contribution caches must refresh after reload.",
      remediation:
        "Consume the reload response UI refresh marker and invalidate UI contribution queries.",
    });
  }

  return {
    executionAvailable: true,
    generationId: params.registry.generationId,
    hostHealthRelevant: Boolean(mandatoryDeclaration),
    issues,
    mandatory: Boolean(mandatoryDeclaration),
    mandatoryCapabilities: mandatoryDeclaration?.capabilities,
    mandatoryReason: mandatoryDeclaration?.reason,
    nextGenerationId:
      typeof params.registry.generationId === "number"
        ? params.registry.generationId + 1
        : undefined,
    ownedRegistrations: countOwnedRegistrations(params.registry, plugin.id),
    pluginId: plugin.id,
    preflightPassed: issues.every((issue) => issue.level !== "error"),
    requiresRestart: issues.some((issue) =>
      [
        "plugin.reload.non_reloadable_service",
        "plugin.reload.plugin_not_loaded",
        "plugin.reload.source_missing",
        "plugin.runtime.stale_generation",
      ].includes(issue.code)
    ),
    steps,
  };
}

export function validatePluginUninstall(params: {
  pluginId: string;
  registry: PluginRegistry;
}): PluginUninstallValidationReport {
  const issues: PluginInstallValidationIssue[] = [];
  const plugin = params.registry.plugins.find(
    (entry) => entry.id === params.pluginId
  );
  if (!plugin) {
    const mandatoryDeclaration = getMandatoryPluginDeclaration(params.pluginId);
    return {
      hostHealthRelevant: Boolean(mandatoryDeclaration),
      issues: [
        {
          code: "plugin.uninstall.plugin_missing",
          level: "error",
          message: `Plugin is not installed: ${params.pluginId}`,
          remediation: "Refresh plugin discovery before retrying uninstall.",
        },
      ],
      mandatory: Boolean(mandatoryDeclaration),
      mandatoryCapabilities: mandatoryDeclaration?.capabilities,
      mandatoryReason: mandatoryDeclaration?.reason,
      pluginId: params.pluginId,
      removableAtRuntime: false,
      requiresRestart: false,
    };
  }

  const mandatoryDeclaration = getMandatoryPluginDeclaration(plugin.id);
  if (mandatoryDeclaration) {
    pushIssue(issues, {
      code: "plugin.uninstall.mandatory_plugin",
      level: "error",
      message: `${plugin.id} is a mandatory host plugin.`,
      remediation:
        "Resolve the host platform dependency decision before uninstalling this package.",
    });
  }

  const provided = pluginProvides(plugin);
  for (const dependent of params.registry.plugins) {
    if (dependent.id === plugin.id || !dependent.enabled) {
      continue;
    }
    const matchedRequirement = (dependent.requires ?? []).find((requirement) =>
      provided.has(requirement)
    );
    if (!matchedRequirement) {
      continue;
    }
    pushIssue(issues, {
      code: "plugin.uninstall.required_by_enabled_plugin",
      level: "error",
      message: `${plugin.id} is required by enabled plugin ${dependent.id} (${matchedRequirement}).`,
      remediation:
        "Disable or uninstall dependent plugins before uninstalling this package.",
    });
  }

  for (const entry of params.registry.services.filter(
    (serviceEntry) => serviceEntry.pluginId === plugin.id
  )) {
    if (isNonReloadableService(entry.service)) {
      pushIssue(issues, {
        code: "plugin.uninstall.non_reloadable_service",
        level: "error",
        message: `Owned service cannot be stopped at runtime: ${entry.service.id}`,
        remediation:
          "Add a stop handler and mark the service reloadable, or restart the API before uninstall.",
      });
    }
  }

  pushIssue(issues, {
    code: "plugin.uninstall.data_review_required",
    level: "info",
    message: "Uninstall does not remove module data or applied migrations.",
    remediation:
      "Review data retention and migration rollback separately from package removal.",
  });

  return {
    hostHealthRelevant: Boolean(mandatoryDeclaration),
    issues,
    mandatory: Boolean(mandatoryDeclaration),
    mandatoryCapabilities: mandatoryDeclaration?.capabilities,
    mandatoryReason: mandatoryDeclaration?.reason,
    pluginId: plugin.id,
    removableAtRuntime: issues.every((issue) => issue.level !== "error"),
    requiresRestart: issues.some(
      (issue) => issue.code === "plugin.uninstall.non_reloadable_service"
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPackageJson(rootDir: string): PackageJson | null {
  const packagePath = path.join(rootDir, "package.json");
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf-8")) as unknown;
    return isRecord(parsed) ? (parsed as PackageJson) : null;
  } catch {
    return null;
  }
}

function pushIssue(
  issues: PluginInstallValidationIssue[],
  issue: PluginInstallValidationIssue
) {
  issues.push(issue);
}

function isAllowedDevDependency(name: string) {
  return name.startsWith("@types/") || TOOLING_DEV_DEPENDENCIES.has(name);
}

function getExportEntry(
  exportsField: unknown,
  subpath: string
): unknown | undefined {
  if (typeof exportsField === "string" && subpath === ".") {
    return exportsField;
  }
  if (!isRecord(exportsField)) {
    return;
  }
  return exportsField[subpath];
}

function exportEntryHasDefault(entry: unknown): boolean {
  if (typeof entry === "string") {
    return true;
  }
  if (!isRecord(entry)) {
    return false;
  }
  return typeof entry.default === "string" || typeof entry.import === "string";
}

function exportEntryHasTypes(entry: unknown): boolean {
  return isRecord(entry) && typeof entry.types === "string";
}

function collectExportRuntimeTargets(entry: unknown): string[] {
  if (typeof entry === "string") {
    return [entry];
  }
  if (!isRecord(entry)) {
    return [];
  }
  return [entry.default, entry.import]
    .filter((target): target is string => typeof target === "string")
    .map((target) => target.trim())
    .filter(Boolean);
}

function uiExportSubpath(packageName: string | undefined, uiEntry: string) {
  if (!packageName) {
    return;
  }
  if (uiEntry === packageName) {
    return ".";
  }
  const prefix = `${packageName}/`;
  if (!uiEntry.startsWith(prefix)) {
    return;
  }
  return `./${uiEntry.slice(prefix.length)}`;
}

function validateExportEntry(params: {
  entry: unknown;
  issues: PluginInstallValidationIssue[];
  requireCompiledArtifact?: boolean;
  subpath: string;
}) {
  if (params.entry === undefined) {
    pushIssue(params.issues, {
      code: "plugin.install.package_export_missing",
      level: "error",
      message: `package.json exports is missing required subpath ${params.subpath}.`,
      remediation:
        "Add package.json exports for each server and UI entry surface.",
    });
    return;
  }
  if (!exportEntryHasDefault(params.entry)) {
    pushIssue(params.issues, {
      code: "plugin.install.package_export_default_missing",
      level: "error",
      message: `package.json export ${params.subpath} is missing a default/import target.`,
      remediation:
        "Add a default or import target for the compiled runtime entry.",
    });
  }
  if (params.requireCompiledArtifact) {
    for (const target of collectExportRuntimeTargets(params.entry)) {
      validateCompiledArtifactTarget({
        entry: target,
        field: `package.json exports ${params.subpath}`,
        issues: params.issues,
      });
    }
  }
  if (!exportEntryHasTypes(params.entry)) {
    pushIssue(params.issues, {
      code: "plugin.install.package_export_types_missing",
      level: "warn",
      message: `package.json export ${params.subpath} is missing a types target.`,
      remediation:
        "Add a types target so plugin package contracts are inspectable.",
    });
  }
}

function validatePackageExports(params: {
  issues: PluginInstallValidationIssue[];
  manifest?: PluginManifest;
  packageJson: PackageJson;
  sourceType: PluginRecord["sourceType"];
}) {
  if (params.packageJson.exports === undefined) {
    pushIssue(params.issues, {
      code: "plugin.install.package_exports_missing",
      level: "warn",
      message: "package.json exports is missing.",
      remediation:
        "Declare stable package exports before distributing the module package.",
    });
    return;
  }

  if (params.manifest?.server?.entry) {
    validateExportEntry({
      entry: getExportEntry(params.packageJson.exports, "."),
      issues: params.issues,
      requireCompiledArtifact: params.sourceType === "package",
      subpath: ".",
    });
  }

  const uiSubpath =
    params.manifest?.ui?.entry && params.manifest.ui.load !== "runtime"
      ? uiExportSubpath(params.packageJson.name, params.manifest.ui.entry)
      : undefined;
  if (uiSubpath) {
    validateExportEntry({
      entry: getExportEntry(params.packageJson.exports, uiSubpath),
      issues: params.issues,
      requireCompiledArtifact: params.sourceType === "package",
      subpath: uiSubpath,
    });
  }
}

function validateRuntimeDependencies(params: {
  issues: PluginInstallValidationIssue[];
  packageJson: PackageJson;
}) {
  const dependencies = params.packageJson.dependencies ?? {};
  const devDependencies = params.packageJson.devDependencies ?? {};
  for (const name of Object.keys(devDependencies)) {
    if (isAllowedDevDependency(name) || dependencies[name] !== undefined) {
      continue;
    }
    pushIssue(params.issues, {
      code: "plugin.install.runtime_dependency_in_dev",
      level: "warn",
      message: `Dependency ${name} is declared only in devDependencies.`,
      remediation:
        "Move runtime imports to dependencies before distributing the module package.",
    });
  }
}

function resolveLocalPath(rootDir: string, maybeRelative: string) {
  if (!(maybeRelative.startsWith("./") || maybeRelative.startsWith("../"))) {
    return null;
  }
  return path.resolve(rootDir, maybeRelative);
}

function isPathInRoot(filePath: string, rootDir: string) {
  const relative = path.relative(rootDir, filePath);
  return (
    relative === "" ||
    (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function isRemoteEntry(entry: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(entry) || entry.startsWith("//");
}

function isCompiledArtifactPath(entry: string) {
  return COMPILED_ARTIFACT_EXTENSIONS.has(path.extname(entry));
}

function validateCompiledArtifactTarget(params: {
  entry: string;
  field: string;
  issues: PluginInstallValidationIssue[];
}) {
  if (!isCompiledArtifactPath(params.entry)) {
    pushIssue(params.issues, {
      code: "plugin.install.compiled_artifact_unsupported",
      level: "error",
      message: `${params.field} must point to a compiled JavaScript artifact: ${params.entry}`,
      remediation:
        "Build package entries to .js, .mjs, or .cjs before making the package installable.",
    });
  }
}

function validateLocalEntry(params: {
  entry: string;
  field: string;
  issues: PluginInstallValidationIssue[];
  rootDir: string;
  sourceType: PluginRecord["sourceType"];
}) {
  const localPath = resolveLocalPath(params.rootDir, params.entry);
  if (!localPath) {
    return;
  }
  if (!isPathInRoot(localPath, params.rootDir)) {
    pushIssue(params.issues, {
      code: "plugin.install.entry_outside_package",
      level: "error",
      message: `${params.field} must stay inside the package root: ${params.entry}`,
      path: localPath,
      remediation:
        "Move the artifact under the package root or update the manifest entry.",
    });
    return;
  }
  if (!fs.existsSync(localPath)) {
    pushIssue(params.issues, {
      code: "plugin.install.entry_missing",
      level: "error",
      message: `${params.field} points to a missing file: ${params.entry}`,
      path: localPath,
      remediation:
        "Build the package or update engenty.plugin.json to a valid entry.",
    });
  }
  if (params.sourceType === "package") {
    validateCompiledArtifactTarget({
      entry: params.entry,
      field: params.field,
      issues: params.issues,
    });
  }
}

function isPackageSpecifier(entry: string) {
  return !(entry.startsWith("./") || entry.startsWith("../"));
}

function validateServerEntryPolicy(params: {
  entry: string;
  issues: PluginInstallValidationIssue[];
  rootDir: string;
  sourceType: PluginRecord["sourceType"];
}) {
  if (isRemoteEntry(params.entry)) {
    pushIssue(params.issues, {
      code: "plugin.install.remote_server_entry_blocked",
      level: "error",
      message: `server.entry may not load remote code: ${params.entry}`,
      remediation:
        "Use a local package artifact for privileged server plugin code.",
    });
    return;
  }
  if (isPackageSpecifier(params.entry)) {
    pushIssue(params.issues, {
      code: "plugin.install.server_entry_unsupported",
      level: "error",
      message: `server.entry must be a local package path: ${params.entry}`,
      remediation:
        "Declare server.entry as a relative path under the package root.",
    });
    return;
  }
  validateLocalEntry({
    entry: params.entry,
    field: "server.entry",
    issues: params.issues,
    rootDir: params.rootDir,
    sourceType: params.sourceType,
  });
}

function validateUiStaticAssetPolicy(params: {
  issues: PluginInstallValidationIssue[];
  manifest: PluginManifest;
  rootDir: string;
}) {
  for (const asset of params.manifest.ui?.staticAssets ?? []) {
    if (isRemoteEntry(asset)) {
      pushIssue(params.issues, {
        code: "plugin.install.remote_static_asset_blocked",
        level: "error",
        message: `Remote UI static assets are blocked by the current Phase 08 trust policy: ${asset}`,
        remediation:
          "Package UI assets under the module root until signed asset origins are implemented.",
      });
      continue;
    }
    const localPath = resolveLocalPath(params.rootDir, asset);
    if (!localPath) {
      pushIssue(params.issues, {
        code: "plugin.install.static_asset_unsupported",
        level: "error",
        message: `UI static asset must be a local package path: ${asset}`,
        remediation:
          "Declare static assets as relative paths under the package root.",
      });
      continue;
    }
    if (!isPathInRoot(localPath, params.rootDir)) {
      pushIssue(params.issues, {
        code: "plugin.install.static_asset_outside_package",
        level: "error",
        message: `UI static asset must stay inside the package root: ${asset}`,
        path: localPath,
        remediation:
          "Move the static asset under the package root or remove it from the manifest.",
      });
      continue;
    }
    if (!fs.existsSync(localPath)) {
      pushIssue(params.issues, {
        code: "plugin.install.static_asset_missing",
        level: "error",
        message: `UI static asset is missing: ${asset}`,
        path: localPath,
        remediation:
          "Build or include the declared static asset before installing the package.",
      });
      continue;
    }
    if (path.extname(localPath) === ".css") {
      const cssSource = fs.readFileSync(localPath, "utf8");
      if (TAILWIND_GLOBAL_BUNDLE_CSS_PATTERN.test(cssSource)) {
        pushIssue(params.issues, {
          code: "plugin.install.ui_css_tailwind_bundle_blocked",
          level: "error",
          message: `UI CSS asset may not ship Tailwind preflight or component bundles: ${asset}`,
          path: localPath,
          remediation:
            "Ship only plugin-scoped utilities in @layer engenty.plugins; the host owns Tailwind base and components.",
        });
      }
      if (!PLUGIN_CSS_LAYER_PATTERN.test(cssSource)) {
        pushIssue(params.issues, {
          code: "plugin.install.ui_css_layer_missing",
          level: "error",
          message: `UI CSS asset must declare @layer engenty.plugins: ${asset}`,
          path: localPath,
          remediation:
            "Wrap plugin CSS in @layer engenty.plugins and scope selectors to the plugin root.",
        });
      }
      validateScopedPluginCss({
        asset,
        cssSource,
        issues: params.issues,
        localPath,
        pluginId: params.manifest.id,
      });
    }
  }

  for (const origin of params.manifest.ui?.assetOrigins ?? []) {
    if (origin === "self") {
      continue;
    }
    pushIssue(params.issues, {
      code: "plugin.install.ui_asset_origin_blocked",
      level: "error",
      message: `UI asset origin is not enabled by the current Phase 08 trust policy: ${origin}`,
      remediation:
        "Use packaged local assets until signed asset origin policy is implemented.",
    });
  }
}

function validateScopedPluginCss(params: {
  asset: string;
  cssSource: string;
  issues: PluginInstallValidationIssue[];
  localPath: string;
  pluginId: string;
}) {
  const cssSource = stripCssComments(params.cssSource);
  const pluginLayerRanges = findPluginCssLayerRanges(cssSource);
  const ruleSelectors = findCssRuleSelectors(cssSource);
  for (const ruleSelector of ruleSelectors) {
    if (!isIndexInRanges(ruleSelector.openBraceIndex, pluginLayerRanges)) {
      pushIssue(params.issues, {
        code: "plugin.install.ui_css_layer_missing",
        level: "error",
        message: `UI CSS selectors must be inside @layer engenty.plugins: ${params.asset}`,
        path: params.localPath,
        remediation:
          "Move plugin CSS rules into @layer engenty.plugins and keep Tailwind base/components in the host.",
      });
      return;
    }
  }

  const unscopedSelector = ruleSelectors
    .flatMap((ruleSelector) => splitCssSelectorList(ruleSelector.selector))
    .find(
      (selector) =>
        selector.length > 0 &&
        !isPluginScopedSelector({
          pluginId: params.pluginId,
          selector,
        })
    );

  if (unscopedSelector) {
    pushIssue(params.issues, {
      code: "plugin.install.ui_css_scope_missing",
      level: "error",
      message: `UI CSS selector must be scoped to the plugin root: ${unscopedSelector}`,
      path: params.localPath,
      remediation: `Prefix plugin CSS selectors with .engenty-plugin-${params.pluginId} or [data-engenty-plugin="${params.pluginId}"].`,
    });
  }
}

function stripCssComments(cssSource: string) {
  return cssSource.replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

function findPluginCssLayerRanges(cssSource: string) {
  const ranges: Array<{ end: number; start: number }> = [];
  const layerPattern = /@layer\s+engenty\.plugins\s*\{/g;
  for (const match of cssSource.matchAll(layerPattern)) {
    const openBraceIndex = (match.index ?? 0) + match[0].length - 1;
    const closeBraceIndex = findMatchingCssBrace(cssSource, openBraceIndex);
    if (closeBraceIndex !== null) {
      ranges.push({ start: openBraceIndex, end: closeBraceIndex });
    }
  }
  return ranges;
}

function findMatchingCssBrace(cssSource: string, openBraceIndex: number) {
  let depth = 0;
  for (let index = openBraceIndex; index < cssSource.length; index += 1) {
    const character = cssSource[index];
    if (character === "{") {
      depth += 1;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return null;
}

function findCssRuleSelectors(cssSource: string) {
  const ruleSelectors: Array<{ openBraceIndex: number; selector: string }> = [];
  const rulePattern = /([^{}]+)\{/g;
  for (const match of cssSource.matchAll(rulePattern)) {
    const selector = match[1]?.trim() ?? "";
    if (!selector || selector.startsWith("@")) {
      continue;
    }
    ruleSelectors.push({
      openBraceIndex: (match.index ?? 0) + match[0].length - 1,
      selector,
    });
  }
  return ruleSelectors;
}

function splitCssSelectorList(selector: string) {
  return selector.split(",").map((part) => part.trim());
}

function isIndexInRanges(
  index: number,
  ranges: ReadonlyArray<{ end: number; start: number }>
) {
  return ranges.some((range) => index > range.start && index < range.end);
}

function isPluginScopedSelector(params: {
  pluginId: string;
  selector: string;
}) {
  const escapedPluginId = escapeRegExp(params.pluginId);
  const classScopePattern = new RegExp(
    `(^|[\\s>+~,(])\\.engenty-plugin-${escapedPluginId}(?=$|[\\s>+~.#:[,)])`
  );
  const dataScopePattern = new RegExp(
    `\\[data-engenty-plugin=(?:"${escapedPluginId}"|'${escapedPluginId}'|${escapedPluginId})\\]`
  );
  return (
    classScopePattern.test(params.selector) ||
    dataScopePattern.test(params.selector)
  );
}

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateUiBundlePolicy(params: {
  issues: PluginInstallValidationIssue[];
  manifest: PluginManifest;
}) {
  const uiEntry = params.manifest.ui?.entry?.trim();
  if (!uiEntry) {
    return;
  }

  if (params.manifest.capabilities?.ui !== true) {
    pushIssue(params.issues, {
      code: "plugin.install.ui_capability_missing",
      level: "error",
      message:
        "Manifest declares a UI entry while capabilities.ui is explicitly disabled.",
      remediation:
        "Remove the explicit capabilities.ui false value or enable it before exposing UI bundle metadata.",
    });
  }

  if (isRemoteEntry(uiEntry)) {
    pushIssue(params.issues, {
      code: "plugin.install.remote_ui_bundle_blocked",
      level: "error",
      message:
        "Remote UI bundle entries are blocked by the current Phase 08 trust policy.",
      remediation:
        "Use a generated local package UI entry until remote bundle signing, origin, and lifecycle checks are implemented.",
    });
  }
}

function validateRuntimeUiEntryPolicy(params: {
  entry: string;
  issues: PluginInstallValidationIssue[];
  rootDir: string;
}) {
  if (isRemoteEntry(params.entry)) {
    return;
  }
  if (isPackageSpecifier(params.entry)) {
    pushIssue(params.issues, {
      code: "plugin.install.runtime_ui_entry_unsupported",
      level: "error",
      message: `ui.entry with ui.load "runtime" must be a local compiled JavaScript artifact: ${params.entry}`,
      remediation:
        "Point ui.entry at a relative .js, .mjs, or .cjs file under the package root.",
    });
    return;
  }
  validateLocalEntry({
    entry: params.entry,
    field: "ui.entry",
    issues: params.issues,
    rootDir: params.rootDir,
    sourceType: "package",
  });
}

function resolveTrustDecision(params: {
  packageJson: PackageJson | null;
  sourceType: PluginRecord["sourceType"];
}): PluginTrustDecision {
  if (params.sourceType === "module") {
    return {
      allowed: true,
      level: "workspace",
      reason: "Workspace modules are trusted by the local host.",
    };
  }
  if (params.packageJson?.name?.startsWith("@engenty/")) {
    return {
      allowed: true,
      level: "first_party",
      reason: "First-party @engenty packages are trusted by the host.",
    };
  }
  if (params.packageJson?.engenty?.trust?.approved === true) {
    return {
      allowed: true,
      level: "approved",
      reason: "Package declares approved Engenty trust metadata.",
    };
  }
  return {
    allowed: false,
    level: "blocked",
    reason: "Package is not first-party and has no approved trust metadata.",
  };
}

function hasSqlMigrations(dir: string) {
  if (!(fs.existsSync(dir) && fs.statSync(dir).isDirectory())) {
    return false;
  }
  return fs.readdirSync(dir).some((file) => file.endsWith(".sql"));
}

function validateDependencies(params: {
  issues: PluginInstallValidationIssue[];
  manifest: PluginManifest;
  registry?: PluginRegistry;
}) {
  if (!params.registry) {
    return;
  }
  const providers = new Set<string>();
  for (const plugin of params.registry.plugins) {
    providers.add(plugin.id);
    providers.add(`module.${plugin.id}`);
    for (const capability of plugin.provides ?? []) {
      providers.add(capability);
    }
  }
  for (const requirement of params.manifest.requires ?? []) {
    if (providers.has(requirement)) {
      continue;
    }
    pushIssue(params.issues, {
      code: "plugin.install.required_dependency_missing",
      level: "error",
      message: `Required dependency is not installed: ${requirement}`,
      remediation:
        "Install the required module or remove the requirement from the manifest.",
    });
  }
}

export function validatePluginInstall(params: {
  packageName?: string;
  pluginId?: string;
  registry?: PluginRegistry;
  rootDir: string;
  sourceType: PluginRecord["sourceType"];
}): PluginInstallValidationReport {
  const rootDir = path.resolve(params.rootDir);
  const issues: PluginInstallValidationIssue[] = [];
  const packageJson = readPackageJson(rootDir);
  const trust = resolveTrustDecision({
    packageJson,
    sourceType: params.sourceType,
  });

  if (packageJson) {
    if (!packageJson.name?.trim()) {
      pushIssue(issues, {
        code: "plugin.install.package_name_missing",
        level: "error",
        message: "package.json must declare a stable package name.",
        remediation: "Add package.json name before installing the module.",
      });
    }
    if (!packageJson.version?.trim()) {
      pushIssue(issues, {
        code: "plugin.install.package_version_missing",
        level: "error",
        message: "package.json must declare a stable package version.",
        remediation: "Add package.json version before installing the module.",
      });
    }
  } else {
    pushIssue(issues, {
      code: "plugin.install.package_json_invalid",
      level: "error",
      message: "package.json is missing or invalid.",
      path: path.join(rootDir, "package.json"),
      remediation: "Add a valid package.json to the module package root.",
    });
  }

  if (!trust.allowed) {
    pushIssue(issues, {
      code: "plugin.install.untrusted_package",
      level: "error",
      message: trust.reason,
      remediation:
        "Use a first-party package or add explicit approved trust metadata after review.",
    });
  }

  const manifestResult = loadPluginManifest(rootDir);
  if (!manifestResult.ok) {
    pushIssue(issues, {
      code: manifestResult.code,
      level: "error",
      message: manifestResult.error,
      path: manifestResult.manifestPath,
      remediation: "Add a valid engenty.plugin.json before installing.",
    });
    return {
      hostHealthRelevant: false,
      installable: false,
      issues,
      mandatory: false,
      migrationReviewRequired: false,
      packageName: params.packageName ?? packageJson?.name,
      pluginId: params.pluginId,
      rootDir,
      sourceType: params.sourceType,
      trust,
    };
  }

  const { manifest } = manifestResult;
  const mandatoryDeclaration = getMandatoryPluginDeclaration(manifest.id);
  for (const diagnostic of manifestResult.diagnostics) {
    pushIssue(issues, {
      code: diagnostic.code,
      level: diagnostic.level,
      message: diagnostic.message,
      remediation:
        "Align engenty.plugin.json version with package.json, or drop one of the versions if duplication is unintended.",
    });
  }

  if (!(manifest.server?.entry || manifest.ui?.entry)) {
    pushIssue(issues, {
      code: "plugin.install.entry_missing",
      level: "error",
      message: "Manifest must declare at least one server or UI entry.",
      remediation:
        "Add server.entry, ui.entry, or both to engenty.plugin.json.",
    });
  }

  if (manifest.server?.entry) {
    validateServerEntryPolicy({
      entry: manifest.server.entry,
      issues,
      rootDir,
      sourceType: params.sourceType,
    });
  }

  if (manifest.ui?.entry) {
    if (manifest.ui.load === "runtime") {
      validateRuntimeUiEntryPolicy({
        entry: manifest.ui.entry,
        issues,
        rootDir,
      });
    } else {
      validateLocalEntry({
        entry: manifest.ui.entry,
        field: "ui.entry",
        issues,
        rootDir,
        sourceType: params.sourceType,
      });
    }
    validateUiBundlePolicy({ issues, manifest });
    validateUiStaticAssetPolicy({ issues, manifest, rootDir });
  }

  if (packageJson) {
    validatePackageExports({
      issues,
      manifest,
      packageJson,
      sourceType: params.sourceType,
    });
    validateRuntimeDependencies({ issues, packageJson });
  }

  validateDependencies({ issues, manifest, registry: params.registry });

  const migrationsDir = packageJson?.engenty?.migrationsDir;
  const defaultMigrationsDir = path.join(rootDir, "supabase", "migrations");
  const declaredMigrationsDir = migrationsDir
    ? path.resolve(rootDir, migrationsDir)
    : null;
  const hasMigrations =
    (declaredMigrationsDir && hasSqlMigrations(declaredMigrationsDir)) ||
    hasSqlMigrations(defaultMigrationsDir);
  if (hasMigrations && !migrationsDir) {
    pushIssue(issues, {
      code: "plugin.install.migrations_dir_missing",
      level: "error",
      message:
        "SQL migrations exist but package.json engenty.migrationsDir is missing.",
      remediation:
        "Declare engenty.migrationsDir so migrations can be reviewed.",
    });
  }
  if (declaredMigrationsDir && hasSqlMigrations(declaredMigrationsDir)) {
    pushIssue(issues, {
      code: "plugin.install.migration_review_required",
      level: "info",
      message:
        "Package includes SQL migrations that require admin review before apply.",
      path: declaredMigrationsDir,
      remediation:
        "Review and aggregate migrations before enabling the module.",
    });
  }

  return {
    hostHealthRelevant: Boolean(mandatoryDeclaration),
    installable: issues.every((issue) => issue.level !== "error"),
    issues,
    mandatory: Boolean(mandatoryDeclaration),
    mandatoryCapabilities: mandatoryDeclaration?.capabilities,
    mandatoryReason: mandatoryDeclaration?.reason,
    manifest,
    manifestPath: manifestResult.manifestPath,
    migrationReviewRequired: issues.some(
      (issue) => issue.code === "plugin.install.migration_review_required"
    ),
    packageName: params.packageName ?? packageJson?.name,
    pluginId: params.pluginId ?? manifest.id,
    rootDir,
    sourceType: params.sourceType,
    trust,
  };
}
