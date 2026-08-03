import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PluginDiagnostic } from "@engenty/plugin-sdk";
import { discoverPluginPackageRoot } from "./discovery.js";
import {
  type PluginInstallValidationIssue,
  type PluginInstallValidationReport,
  type PluginUninstallValidationReport,
  validatePluginInstall,
  validatePluginUninstall,
} from "./install-validation.js";
import { createPluginRecord } from "./loader.js";
import { loadPluginManifest, type PluginManifest } from "./manifest.js";
import {
  createPluginSourceInfo,
  type PluginRecord,
  type PluginRegistry,
} from "./registry.js";
import {
  type ServiceLifecycleContext,
  type UnloadOwnedRegistrationsResult,
  unloadOwnedRegistrations,
} from "./service-lifecycle.js";

export type PackageLifecycleOperation = "install" | "uninstall" | "update";

export type PackageLifecycleStepKey =
  | "validation"
  | "mutation_plan"
  | "execution_policy"
  | "command_execution"
  | "post_install_discovery"
  | "runtime_unload"
  | "cleanup_policy"
  | "result";

export interface PackageLifecycleExecutionStep {
  details?: unknown;
  diagnostics?: PluginDiagnostic[];
  key: PackageLifecycleStepKey;
  message: string;
  status: "blocked" | "failed" | "skipped" | "succeeded";
}

export interface PackageLifecycleRollbackPolicy {
  dataRemoval: "manual_review_required";
  lockfileMutation: "git_review_revert" | "not_attempted";
  packageJsonMutation: "git_review_revert" | "not_attempted";
  recovery: string;
}

export interface PackageLifecycleMutationPlan {
  acquisition: "pnpm_add" | "pnpm_remove" | "unsupported";
  diffCapture: "git_status_and_diff" | "planned_only";
  executionMode: "confirmed" | "requires_confirmation" | "unsupported";
  installedPackageTarget: string;
  lockfilePath: "pnpm-lock.yaml";
  packageJsonPath: "package.json";
  packageManager: "pnpm";
  packageSpec: string;
  policy: "explicit_admin_confirmation_required" | "unsupported_operation";
  target: "workspace_root";
}

export interface PackageLifecycleDryRunDiff {
  generated: false;
  installedPackageChanges: [];
  lockfileChanges: [];
  packageJsonChanges: [];
  reason: string;
}

export interface PackageLifecycleExecutionResult {
  activation: {
    autoEnabled: false;
    restartRequired: boolean;
  };
  commandPlan?: PackageLifecycleCommandPlan;
  commandResult?: PackageLifecycleCommandResult;
  discovery?: PackageLifecycleDiscoveryResult;
  dryRunDiff: PackageLifecycleDryRunDiff;
  executionAvailable: boolean;
  issues: PluginDiagnostic[];
  mutationPlan: PackageLifecycleMutationPlan;
  nextSteps: string[];
  operation: PackageLifecycleOperation;
  pluginId: string;
  rollbackPolicy: PackageLifecycleRollbackPolicy;
  status: "blocked" | "failed" | "succeeded";
  steps: PackageLifecycleExecutionStep[];
  unload?: UnloadOwnedRegistrationsResult;
  validation?: PluginInstallValidationReport | PluginUninstallValidationReport;
}

export interface PackageLifecycleCommandPlan {
  args: string[];
  command: "pnpm";
  cwd: string;
  packageSpec: string;
}

export interface PackageLifecycleCommandResult {
  args: string[];
  command: "pnpm";
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  signal?: string | null;
  stderrSummary: string;
  stdoutSummary: string;
}

export type PackageLifecycleCommandRunner = (
  plan: PackageLifecycleCommandPlan
) => Promise<PackageLifecycleCommandResult>;

export interface PackageLifecycleDiscoveryResult {
  diagnostics: PluginDiagnostic[];
  discoverable: boolean;
  loadable: boolean;
  manifestPath?: string;
  nextSteps: string[];
  packageName: string;
  pluginId: string;
  registered: boolean;
  restartRequired: boolean;
  rootDir: string;
  source?: string;
  status:
    | "invalid"
    | "loadable"
    | "missing"
    | "registered_disabled"
    | "restart_required";
  validation?: PluginInstallValidationReport;
}

let activePackageLifecycle:
  | { operation: PackageLifecycleOperation; pluginId: string }
  | undefined;

function diagnosticFromIssue(params: {
  issue: PluginInstallValidationIssue;
  pluginId: string;
  record?: PluginRecord;
}): PluginDiagnostic {
  return {
    code: params.issue.code,
    level: params.issue.level,
    message: params.issue.message,
    pluginId: params.pluginId,
    remediation: params.issue.remediation,
    sourceInfo: params.record
      ? createPluginSourceInfo(params.record, "package.lifecycle")
      : undefined,
  };
}

function createPolicyDiagnostic(params: {
  code: string;
  message: string;
  record: PluginRecord;
  remediation: string;
}): PluginDiagnostic {
  return {
    code: params.code,
    level: "warn",
    message: params.message,
    pluginId: params.record.id,
    remediation: params.remediation,
    sourceInfo: createPluginSourceInfo(params.record, "package.lifecycle"),
  };
}

function missingPluginResult(
  operation: PackageLifecycleOperation,
  pluginId: string
): PackageLifecycleExecutionResult {
  const diagnostic: PluginDiagnostic = {
    code: `plugin.${operation}.plugin_missing`,
    level: "error",
    message: `Plugin is not installed: ${pluginId}`,
    pluginId,
    remediation:
      "Refresh plugin discovery before retrying package lifecycle execution.",
  };
  return {
    activation: {
      autoEnabled: false,
      restartRequired: false,
    },
    dryRunDiff: createDryRunDiff(),
    executionAvailable: false,
    issues: [diagnostic],
    mutationPlan: createMutationPlan({ packageSpec: pluginId }),
    nextSteps: [
      "Refresh plugin discovery and retry from a discovered package.",
    ],
    operation,
    pluginId,
    rollbackPolicy: baseRollbackPolicy(),
    status: "blocked",
    steps: [
      {
        diagnostics: [diagnostic],
        key: "validation",
        message: "Package lifecycle validation blocked execution.",
        status: "blocked",
      },
      {
        key: "result",
        message: "Package lifecycle execution was not started.",
        status: "blocked",
      },
    ],
  };
}

function baseRollbackPolicy(): PackageLifecycleRollbackPolicy {
  return {
    dataRemoval: "manual_review_required",
    lockfileMutation: "not_attempted",
    packageJsonMutation: "not_attempted",
    recovery:
      "No package files were changed. Review git status before retrying package lifecycle execution.",
  };
}

function gitRollbackPolicy(): PackageLifecycleRollbackPolicy {
  return {
    dataRemoval: "manual_review_required",
    lockfileMutation: "git_review_revert",
    packageJsonMutation: "git_review_revert",
    recovery:
      "Use git status and git diff to review package.json and pnpm-lock.yaml; commit accepted package changes or revert them with git before retrying.",
  };
}

function createMutationPlan(params: {
  executionMode?: PackageLifecycleMutationPlan["executionMode"];
  operation?: PackageLifecycleOperation;
  record?: PluginRecord;
  packageSpec?: string;
}): PackageLifecycleMutationPlan {
  const packageSpec =
    params.packageSpec ?? params.record?.packageName ?? params.record?.id ?? "";
  const installedPackageName = packageSpec
    ? packageNameFromSpec(packageSpec)
    : "";
  const operation = params.operation ?? "install";
  const supportedMutation =
    operation === "install" ||
    operation === "update" ||
    operation === "uninstall";
  const executionMode = params.executionMode ?? "requires_confirmation";
  return {
    acquisition:
      operation === "uninstall"
        ? "pnpm_remove"
        : supportedMutation
          ? "pnpm_add"
          : "unsupported",
    diffCapture:
      executionMode === "confirmed" ? "git_status_and_diff" : "planned_only",
    executionMode,
    installedPackageTarget: installedPackageName
      ? `node_modules/${installedPackageName}`
      : "node_modules/<package>",
    lockfilePath: "pnpm-lock.yaml",
    packageJsonPath: "package.json",
    packageManager: "pnpm",
    packageSpec,
    policy:
      executionMode === "unsupported"
        ? "unsupported_operation"
        : "explicit_admin_confirmation_required",
    target: "workspace_root",
  };
}

function createPackageAcquisitionRecord(params: {
  packageSpec: string;
  pluginId: string;
  workspaceRoot: string;
}): PluginRecord {
  const packageName = packageNameFromSpec(params.packageSpec);
  const rootDir = path.resolve(
    params.workspaceRoot,
    "node_modules",
    packageName
  );
  return {
    id: params.pluginId,
    cliCommands: [],
    dependencies: [],
    enabled: false,
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    loaded: false,
    manifestPath: path.join(rootDir, "engenty.plugin.json"),
    moduleOperations: [],
    packageName,
    queues: [],
    rootDir,
    services: [],
    source: "",
    sourceType: "package",
    testDataTypes: [],
  };
}

function createDryRunDiff(): PackageLifecycleDryRunDiff {
  return {
    generated: false,
    installedPackageChanges: [],
    lockfileChanges: [],
    packageJsonChanges: [],
    reason:
      "Package lifecycle uses git status and git diff for review after a confirmed package-manager mutation.",
  };
}

function validationBlockedNextSteps(operation: PackageLifecycleOperation) {
  return [
    `Resolve the ${operation} validation diagnostics first.`,
    "Rerun the package lifecycle report before attempting execution.",
  ];
}

function deferredNextSteps(operation: PackageLifecycleOperation) {
  if (operation === "uninstall") {
    return [
      "Disable the plugin globally before package removal.",
      "Confirm tenant activation overrides are disabled or intentionally retained before removal.",
      "Review retained data and migrations manually; runtime uninstall does not drop data.",
      "Retry with confirm_package_mutation=true to run pnpm remove for the package name.",
    ];
  }
  return [
    "Review the validated package artifact and migration report.",
    "Retry with confirm_package_mutation=true to run pnpm add for the package spec.",
    "After pnpm completes, review git status and git diff before committing or reverting.",
  ];
}

function dedupeNextSteps(steps: string[]) {
  return [...new Set(steps)];
}

function migrationReviewNextSteps(
  validation: PluginInstallValidationReport | undefined
) {
  if (!validation?.migrationReviewRequired) {
    return [];
  }
  return [
    "Review and aggregate package migrations before enabling the plugin.",
  ];
}

function executionDeferredDiagnostic(
  operation: PackageLifecycleOperation,
  record: PluginRecord
) {
  const verb = operation === "update" ? "update" : operation;
  return createPolicyDiagnostic({
    code: `plugin.${operation}.package_mutation_deferred`,
    message: `Package ${verb} execution is deferred by the current Phase 08 safety policy.`,
    record,
    remediation:
      "Package-manager mutation requires an explicit reviewed workflow before the API may edit package.json, pnpm-lock.yaml, or installed package contents.",
  });
}

function confirmationRequiredDiagnostic(
  operation: PackageLifecycleOperation,
  record: PluginRecord
) {
  return createPolicyDiagnostic({
    code: `plugin.${operation}.package_mutation_deferred`,
    message: `Package ${operation} requires explicit package-manager mutation confirmation.`,
    record,
    remediation:
      "Retry with confirm_package_mutation=true only after reviewing validation diagnostics and accepting that pnpm may edit package.json and pnpm-lock.yaml.",
  });
}

function packageSourceRequiredDiagnostic(
  operation: PackageLifecycleOperation,
  record: PluginRecord
) {
  return createPolicyDiagnostic({
    code: `plugin.${operation}.package_source_required`,
    message: `Package ${operation} requires a discovered npm package record.`,
    record,
    remediation:
      "Use package-manager removal only for sourceType=package records discovered from node_modules.",
  });
}

function uninstallEnabledDiagnostic(record: PluginRecord) {
  return createPolicyDiagnostic({
    code: "plugin.uninstall.global_disable_required",
    message: `Package uninstall requires the plugin to be globally disabled first: ${record.id}`,
    record,
    remediation:
      "Disable the plugin globally, confirm tenant activation state is reviewed, then retry uninstall.",
  });
}

function unloadContextRequiredDiagnostic(record: PluginRecord) {
  return createPolicyDiagnostic({
    code: "plugin.uninstall.runtime_unload_required",
    message: `Loaded plugin must be safely unloaded before package removal: ${record.id}`,
    record,
    remediation:
      "Retry through the admin API so the package lifecycle executor can stop services and dispose owned registrations before pnpm remove.",
  });
}

function unloadBlockedDiagnostic(params: {
  record: PluginRecord;
  unload: UnloadOwnedRegistrationsResult;
}) {
  return createPolicyDiagnostic({
    code: "plugin.uninstall.runtime_unload_blocked",
    message: `Loaded plugin could not be safely unloaded before package removal: ${params.record.id}`,
    record: params.record,
    remediation:
      "Resolve service stop or disposer diagnostics before retrying package removal.",
  });
}

function lifecycleInProgressDiagnostic(params: {
  active: { operation: PackageLifecycleOperation; pluginId: string };
  operation: PackageLifecycleOperation;
  record: PluginRecord;
}) {
  return createPolicyDiagnostic({
    code: "plugin.package.lifecycle_in_progress",
    message: `Package ${params.operation} cannot start while ${params.active.operation} is running for ${params.active.pluginId}.`,
    record: params.record,
    remediation:
      "Wait for the active package-manager operation to finish before retrying.",
  });
}

function packageCommandFailedDiagnostic(params: {
  operation: PackageLifecycleOperation;
  record: PluginRecord;
  result: PackageLifecycleCommandResult;
}) {
  return {
    code: `plugin.${params.operation}.package_command_failed`,
    level: "error",
    message: `pnpm ${params.result.args[0]} exited with code ${params.result.exitCode ?? "unknown"}.`,
    pluginId: params.record.id,
    remediation:
      "Review the command output summary, fix the package-manager issue, and use git status/diff before retrying.",
    sourceInfo: createPluginSourceInfo(params.record, "package.lifecycle"),
  } satisfies PluginDiagnostic;
}

function packageCommandSucceededDiagnostic(params: {
  operation: PackageLifecycleOperation;
  record: PluginRecord;
}) {
  const remediation =
    params.operation === "uninstall"
      ? "Review git status/diff and complete retained data, migration, and tenant activation cleanup manually."
      : "Review git status/diff, then inspect post-install discovery diagnostics before activation.";
  return {
    code: `plugin.${params.operation}.package_command_succeeded`,
    level: "info",
    message: `pnpm package ${params.operation} completed for ${params.record.id}.`,
    pluginId: params.record.id,
    remediation,
    sourceInfo: createPluginSourceInfo(params.record, "package.lifecycle"),
  } satisfies PluginDiagnostic;
}

function packageDiscoveryDiagnostic(params: {
  code: string;
  level: PluginDiagnostic["level"];
  message: string;
  record: PluginRecord;
  remediation: string;
}) {
  return {
    code: params.code,
    level: params.level,
    message: params.message,
    pluginId: params.record.id,
    remediation: params.remediation,
    sourceInfo: createPluginSourceInfo(params.record, "package.discovery"),
  } satisfies PluginDiagnostic;
}

function manifestDiagnosticsToPluginDiagnostics(params: {
  diagnostics: Array<{ code: string; level: "warn"; message: string }>;
  record: PluginRecord;
}) {
  return params.diagnostics.map(
    (diagnostic) =>
      ({
        code: diagnostic.code,
        level: diagnostic.level,
        message: diagnostic.message,
        pluginId: params.record.id,
        remediation:
          "Align engenty.plugin.json metadata with package.json before enabling the plugin.",
        sourceInfo: createPluginSourceInfo(params.record, "package.discovery"),
      }) satisfies PluginDiagnostic
  );
}

function installedPackageRoot(params: {
  packageName: string;
  workspaceRoot: string;
}) {
  const rootDir = path.resolve(
    params.workspaceRoot,
    "node_modules",
    params.packageName
  );
  if (fs.existsSync(rootDir)) {
    return fs.realpathSync.native(rootDir);
  }
  return rootDir;
}

function refreshUnloadedRecordFromDiscoveredPackage(params: {
  candidate: NonNullable<ReturnType<typeof discoverPluginPackageRoot>>;
  manifest: PluginManifest;
  manifestPath: string;
  record: PluginRecord;
  registry: PluginRegistry;
}) {
  const nextRecord = createPluginRecord({
    candidate: params.candidate,
    enabled: false,
    generationId: params.registry.generationId,
    manifest: params.manifest,
    manifestPath: params.manifestPath,
  });
  Object.assign(params.record, nextRecord);
  params.record.sourceInfo = createPluginSourceInfo(
    params.record,
    "server.plugin"
  );
  params.record.dependencies = params.record.requires ?? [];
}

function discoverInstalledPackageAfterMutation(params: {
  allowDiscoveredPluginId?: boolean;
  operation: PackageLifecycleOperation;
  packageName: string;
  record: PluginRecord;
  registry: PluginRegistry;
  workspaceRoot: string;
}): PackageLifecycleDiscoveryResult {
  const rootDir = installedPackageRoot({
    packageName: params.packageName,
    workspaceRoot: params.workspaceRoot,
  });
  const missingResult = (diagnostic: PluginDiagnostic) => {
    params.registry.diagnostics.push(diagnostic);
    return {
      diagnostics: [diagnostic],
      discoverable: false,
      loadable: false,
      nextSteps: [
        "Review pnpm output and git diff to confirm the package was added.",
        "Restart API discovery after resolving the missing installed package.",
      ],
      packageName: params.packageName,
      pluginId: params.record.id,
      registered: false,
      restartRequired: true,
      rootDir,
      status: "missing",
    } satisfies PackageLifecycleDiscoveryResult;
  };

  if (!(fs.existsSync(rootDir) && fs.statSync(rootDir).isDirectory())) {
    return missingResult(
      packageDiscoveryDiagnostic({
        code: `plugin.${params.operation}.package_discovery_missing`,
        level: "warn",
        message: `Installed package was not found after pnpm add: ${params.packageName}`,
        record: params.record,
        remediation:
          "Review pnpm output, node_modules, package.json, and pnpm-lock.yaml before activation.",
      })
    );
  }

  const candidate = discoverPluginPackageRoot({
    rootDir,
    sourceType: "package",
  });
  if (!candidate) {
    const diagnostic = packageDiscoveryDiagnostic({
      code: `plugin.${params.operation}.package_discovery_failed`,
      level: "error",
      message: `Installed package is not discoverable as an Engenty plugin: ${params.packageName}`,
      record: params.record,
      remediation:
        "Ensure the installed package includes engenty.plugin.json and a compiled local server entry.",
    });
    params.registry.diagnostics.push(diagnostic);
    return {
      diagnostics: [diagnostic],
      discoverable: false,
      loadable: false,
      nextSteps: [
        "Fix or revert the installed package artifact before activation.",
        "Restart API discovery after the package is discoverable.",
      ],
      packageName: params.packageName,
      pluginId: params.record.id,
      registered: false,
      restartRequired: true,
      rootDir,
      status: "invalid",
    };
  }

  const manifestResult = loadPluginManifest(candidate.rootDir);
  if (!manifestResult.ok) {
    const diagnostic = packageDiscoveryDiagnostic({
      code: manifestResult.code,
      level: "error",
      message: manifestResult.error,
      record: params.record,
      remediation: "Fix the installed package manifest before activation.",
    });
    params.registry.diagnostics.push(diagnostic);
    return {
      diagnostics: [diagnostic],
      discoverable: false,
      loadable: false,
      manifestPath: manifestResult.manifestPath,
      nextSteps: [
        "Fix or revert the installed package manifest.",
        "Restart API discovery after the manifest is valid.",
      ],
      packageName: params.packageName,
      pluginId: params.record.id,
      registered: false,
      restartRequired: true,
      rootDir: candidate.rootDir,
      source: candidate.source,
      status: "invalid",
    };
  }

  if (
    !params.allowDiscoveredPluginId &&
    manifestResult.manifest.id !== params.record.id
  ) {
    const diagnostic = packageDiscoveryDiagnostic({
      code: `plugin.${params.operation}.package_discovery_id_mismatch`,
      level: "error",
      message: `Installed package manifest id ${manifestResult.manifest.id} does not match ${params.record.id}.`,
      record: params.record,
      remediation:
        "Install the package that owns the selected plugin id, or revert the package-manager change.",
    });
    params.registry.diagnostics.push(diagnostic);
    return {
      diagnostics: [diagnostic],
      discoverable: true,
      loadable: false,
      manifestPath: manifestResult.manifestPath,
      nextSteps: [
        "Install the package matching the selected plugin id.",
        "Use git status and git diff to revert the mismatched package if needed.",
      ],
      packageName: params.packageName,
      pluginId: params.record.id,
      registered: false,
      restartRequired: true,
      rootDir: candidate.rootDir,
      source: candidate.source,
      status: "invalid",
    };
  }

  const validation = validatePluginInstall({
    packageName: candidate.packageName,
    registry: params.registry,
    rootDir: candidate.rootDir,
    sourceType: "package",
  });
  const diagnostics = [
    ...manifestDiagnosticsToPluginDiagnostics({
      diagnostics: manifestResult.diagnostics,
      record: params.record,
    }),
    ...validation.issues.map((issue) =>
      diagnosticFromIssue({
        issue,
        pluginId: params.record.id,
        record: params.record,
      })
    ),
  ];
  const loadable = validation.installable;

  if (!loadable) {
    params.registry.diagnostics.push(...diagnostics);
    return {
      diagnostics,
      discoverable: true,
      loadable: false,
      manifestPath: manifestResult.manifestPath,
      nextSteps: [
        "Resolve package validation diagnostics before activation.",
        "Use git status and git diff to decide whether to keep or revert the package-manager change.",
      ],
      packageName: params.packageName,
      pluginId: params.record.id,
      registered: false,
      restartRequired: true,
      rootDir: candidate.rootDir,
      source: candidate.source,
      status: "invalid",
      validation,
    };
  }

  if (params.record.loaded) {
    const diagnostic = packageDiscoveryDiagnostic({
      code: `plugin.${params.operation}.package_discovery_restart_required`,
      level: "info",
      message: `Installed package is discoverable and loadable; active runtime record remains unchanged until reload or restart: ${params.record.id}`,
      record: params.record,
      remediation:
        "Run a backend reload when preflight allows it, or restart the API before activating package changes.",
    });
    params.registry.diagnostics.push(...diagnostics, diagnostic);
    return {
      diagnostics: [...diagnostics, diagnostic],
      discoverable: true,
      loadable: true,
      manifestPath: manifestResult.manifestPath,
      nextSteps: [
        "Review git status and git diff for the package-manager change.",
        ...migrationReviewNextSteps(validation),
        "Run a backend reload report or restart API discovery before activation.",
        "Enable the plugin globally and tenant overrides explicitly after reload/restart when ready.",
      ],
      packageName: params.packageName,
      pluginId: params.record.id,
      registered: false,
      restartRequired: true,
      rootDir: candidate.rootDir,
      source: candidate.source,
      status: "restart_required",
      validation,
    };
  }

  refreshUnloadedRecordFromDiscoveredPackage({
    candidate,
    manifest: manifestResult.manifest,
    manifestPath: manifestResult.manifestPath,
    record: params.record,
    registry: params.registry,
  });
  if (!params.registry.plugins.includes(params.record)) {
    params.registry.plugins.push(params.record);
  }
  const diagnostic = packageDiscoveryDiagnostic({
    code: `plugin.${params.operation}.package_discovery_registered_disabled`,
    level: "info",
    message: `Installed package is discoverable and registered disabled: ${params.record.id}`,
    record: params.record,
    remediation:
      "Review git status/diff and migration diagnostics before explicitly enabling the plugin.",
  });
  params.registry.diagnostics.push(...diagnostics, diagnostic);
  return {
    diagnostics: [...diagnostics, diagnostic],
    discoverable: true,
    loadable: true,
    manifestPath: manifestResult.manifestPath,
    nextSteps: [
      "Review git status and git diff for the package-manager change.",
      ...migrationReviewNextSteps(validation),
      "Enable the plugin globally when ready.",
      "Enable tenant overrides explicitly for tenants that should receive it.",
    ],
    packageName: params.packageName,
    pluginId: params.record.id,
    registered: true,
    restartRequired: false,
    rootDir: candidate.rootDir,
    source: candidate.source,
    status: "registered_disabled",
    validation,
  };
}

function packageNameFromSpec(packageSpec: string) {
  if (packageSpec.startsWith("@")) {
    const slashIndex = packageSpec.indexOf("/");
    if (slashIndex === -1) {
      return packageSpec;
    }
    const versionIndex = packageSpec.indexOf("@", slashIndex + 1);
    return versionIndex === -1
      ? packageSpec
      : packageSpec.slice(0, versionIndex);
  }
  const versionIndex = packageSpec.indexOf("@");
  return versionIndex === -1 ? packageSpec : packageSpec.slice(0, versionIndex);
}

function isSimplePackageSpec(packageSpec: string) {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[a-z0-9._~^=<>*:+/-]+)?$/i.test(
    packageSpec
  );
}

function resolvePackageSpec(params: {
  operation: PackageLifecycleOperation;
  packageSpec?: string;
  record: PluginRecord;
}) {
  const defaultSpec = params.record.packageName ?? params.record.id;
  const packageSpec = (params.packageSpec ?? defaultSpec).trim();
  const expectedPackageName = params.record.packageName ?? params.record.id;
  const actualPackageName = packageNameFromSpec(packageSpec);

  if (!(packageSpec && isSimplePackageSpec(packageSpec))) {
    return {
      diagnostic: createPolicyDiagnostic({
        code: `plugin.${params.operation}.package_spec_invalid`,
        message: `Package ${params.operation} requires a simple npm package name or package@version spec.`,
        record: params.record,
        remediation:
          "Use a plain package name such as @scope/name or an explicit package@version spec.",
      }),
      packageSpec,
    };
  }

  if (actualPackageName !== expectedPackageName) {
    return {
      diagnostic: createPolicyDiagnostic({
        code: `plugin.${params.operation}.package_spec_mismatch`,
        message: `Package spec ${packageSpec} does not match discovered package ${expectedPackageName}.`,
        record: params.record,
        remediation:
          "Use the discovered package name, optionally with an explicit version for update.",
      }),
      packageSpec,
    };
  }

  if (params.operation === "uninstall" && packageSpec !== actualPackageName) {
    return {
      diagnostic: createPolicyDiagnostic({
        code: `plugin.${params.operation}.package_spec_invalid`,
        message:
          "Package uninstall requires a package name without a version or range.",
        record: params.record,
        remediation:
          "Use the discovered package name exactly, such as @scope/name.",
      }),
      packageSpec,
    };
  }

  return { packageSpec };
}

function createCommandPlan(params: {
  operation: PackageLifecycleOperation;
  packageSpec: string;
  workspaceRoot: string;
}): PackageLifecycleCommandPlan | undefined {
  if (params.operation === "install" || params.operation === "update") {
    return {
      args: ["add", params.packageSpec],
      command: "pnpm",
      cwd: params.workspaceRoot,
      packageSpec: params.packageSpec,
    };
  }
  if (params.operation === "uninstall") {
    const packageName = packageNameFromSpec(params.packageSpec);
    return {
      args: ["remove", packageName],
      command: "pnpm",
      cwd: params.workspaceRoot,
      packageSpec: packageName,
    };
  }
  return;
}

function removeRegistryRecord(registry: PluginRegistry, pluginId: string) {
  const index = registry.plugins.findIndex((plugin) => plugin.id === pluginId);
  if (index === -1) {
    return false;
  }
  registry.plugins.splice(index, 1);
  return true;
}

function redactPotentialSecrets(value: string) {
  return value
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY)[A-Z0-9_]*)=([^\s]+)/gi,
      "$1=[redacted]"
    )
    .replace(/\/\/([^:\s]+):([^@\s]+)@/g, "//$1:[redacted]@")
    .replace(/(_authToken=)[^\s]+/gi, "$1[redacted]");
}

function summarizeCommandOutput(value: string) {
  const redacted = redactPotentialSecrets(value);
  const lines = redacted.split(/\r?\n/).filter(Boolean).slice(-80);
  const summary = lines.join("\n");
  return summary.length > 6000 ? summary.slice(-6000) : summary;
}

export function runPnpmPackageLifecycleCommand(
  plan: PackageLifecycleCommandPlan
): Promise<PackageLifecycleCommandResult> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, plan.args, {
      cwd: plan.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      resolve({
        args: plan.args,
        command: plan.command,
        cwd: plan.cwd,
        durationMs: Date.now() - startedAt,
        exitCode,
        signal,
        stderrSummary: summarizeCommandOutput(stderr),
        stdoutSummary: summarizeCommandOutput(stdout),
      });
    });
  });
}

function installLikeValidation(params: {
  record: PluginRecord;
  registry: PluginRegistry;
}) {
  const report = validatePluginInstall({
    packageName: params.record.packageName,
    pluginId: params.record.id,
    registry: params.registry,
    rootDir: params.record.rootDir,
    sourceType: params.record.sourceType,
  });
  return {
    diagnostics: report.issues.map((issue) =>
      diagnosticFromIssue({
        issue,
        pluginId: report.pluginId ?? params.record.id,
        record: params.record,
      })
    ),
    report,
  };
}

export async function executePluginPackageLifecycle(params: {
  confirmPackageMutation?: boolean;
  operation: PackageLifecycleOperation;
  packageSpec?: string;
  pluginId: string;
  registry: PluginRegistry;
  runner?: PackageLifecycleCommandRunner;
  unloadContext?: Omit<ServiceLifecycleContext, "pluginConfig"> & {
    pluginConfig?: Record<string, unknown>;
  };
  workspaceRoot?: string;
}): Promise<PackageLifecycleExecutionResult> {
  const existingRecord = params.registry.plugins.find(
    (plugin) => plugin.id === params.pluginId
  );
  const acquisitionRecord =
    !existingRecord && params.operation === "install" && params.packageSpec
      ? createPackageAcquisitionRecord({
          packageSpec: params.packageSpec,
          pluginId: params.pluginId,
          workspaceRoot: params.workspaceRoot ?? process.cwd(),
        })
      : undefined;
  const record = existingRecord ?? acquisitionRecord;
  if (!record) {
    return missingPluginResult(params.operation, params.pluginId);
  }
  const isPackageAcquisition = !existingRecord && !!acquisitionRecord;

  const validation = isPackageAcquisition
    ? undefined
    : params.operation === "uninstall"
      ? (() => {
          const report = validatePluginUninstall({
            pluginId: record.id,
            registry: params.registry,
          });
          return {
            diagnostics: report.issues.map((issue) =>
              diagnosticFromIssue({
                issue,
                pluginId: record.id,
                record,
              })
            ),
            report,
          };
        })()
      : installLikeValidation({
          record,
          registry: params.registry,
        });

  // Keyed off `validation` rather than `isPackageAcquisition` — the two say
  // the same thing (validation is undefined exactly for an acquisition), but
  // only this form tells the compiler so.
  const validationPassed = validation
    ? params.operation === "uninstall"
      ? (validation.report as PluginUninstallValidationReport)
          .removableAtRuntime
      : (validation.report as PluginInstallValidationReport).installable
    : true;
  const resolvedPackageSpec = resolvePackageSpec({
    operation: params.operation,
    packageSpec: params.packageSpec,
    record,
  });
  const mutationPlan = createMutationPlan({
    executionMode: params.confirmPackageMutation
      ? "confirmed"
      : "requires_confirmation",
    operation: params.operation,
    packageSpec: resolvedPackageSpec.packageSpec,
    record,
  });
  const dryRunDiff = createDryRunDiff();

  const steps: PackageLifecycleExecutionStep[] = [
    {
      details: validation
        ? params.operation === "uninstall"
          ? {
              removableAtRuntime: (
                validation.report as PluginUninstallValidationReport
              ).removableAtRuntime,
              requiresRestart: (
                validation.report as PluginUninstallValidationReport
              ).requiresRestart,
            }
          : {
              installable: (validation.report as PluginInstallValidationReport)
                .installable,
              migrationReviewRequired: (
                validation.report as PluginInstallValidationReport
              ).migrationReviewRequired,
            }
        : {
            packageSpec: resolvedPackageSpec.packageSpec,
            packageAcquisition: true,
          },
      diagnostics: validation?.diagnostics ?? [],
      key: "validation",
      message: validationPassed
        ? isPackageAcquisition
          ? "Package acquisition request accepted for undiscovered package."
          : "Package lifecycle validation passed."
        : "Package lifecycle validation blocked execution.",
      status: validationPassed ? "succeeded" : "blocked",
    },
  ];

  if (!validationPassed) {
    steps.push({
      key: "result",
      message: "Package lifecycle execution was not started.",
      status: "blocked",
    });
    return {
      activation: {
        autoEnabled: false,
        restartRequired: false,
      },
      dryRunDiff,
      executionAvailable: false,
      issues: validation?.diagnostics ?? [],
      mutationPlan,
      nextSteps: validationBlockedNextSteps(params.operation),
      operation: params.operation,
      pluginId: record.id,
      rollbackPolicy: baseRollbackPolicy(),
      status: "blocked",
      steps,
      validation: validation?.report,
    };
  }

  if (resolvedPackageSpec.diagnostic) {
    params.registry.diagnostics.push(resolvedPackageSpec.diagnostic);
    steps.push({
      diagnostics: [resolvedPackageSpec.diagnostic],
      key: "execution_policy",
      message:
        "Package-manager mutation is blocked by package spec validation.",
      status: "blocked",
    });
    return {
      activation: {
        autoEnabled: false,
        restartRequired: false,
      },
      dryRunDiff,
      executionAvailable: false,
      issues: [
        ...(validation?.diagnostics ?? []),
        resolvedPackageSpec.diagnostic,
      ],
      mutationPlan,
      nextSteps: [
        "Use the discovered package name, optionally with an explicit version.",
        "Retry only after package validation passes.",
      ],
      operation: params.operation,
      pluginId: record.id,
      rollbackPolicy: baseRollbackPolicy(),
      status: "blocked",
      steps,
      validation: validation?.report,
    };
  }

  if (params.operation === "uninstall") {
    const policyDiagnostics: PluginDiagnostic[] = [];
    if (record.sourceType !== "package") {
      policyDiagnostics.push(
        packageSourceRequiredDiagnostic(params.operation, record)
      );
    }
    if (record.enabled) {
      policyDiagnostics.push(uninstallEnabledDiagnostic(record));
    }
    if (policyDiagnostics.length > 0) {
      params.registry.diagnostics.push(...policyDiagnostics);
      steps.push(
        {
          details: {
            dryRunDiff,
            mutationPlan,
          },
          key: "mutation_plan",
          message:
            "Package-manager mutation target plan was generated without file changes.",
          status: "succeeded",
        },
        {
          diagnostics: policyDiagnostics,
          key: "execution_policy",
          message:
            "Package removal is blocked until source and activation policy pass.",
          status: "blocked",
        },
        {
          details: baseRollbackPolicy(),
          key: "cleanup_policy",
          message:
            "No package files were changed; data and migration cleanup remain manual review items.",
          status: "skipped",
        },
        {
          key: "result",
          message: "Package lifecycle execution was blocked before mutation.",
          status: "blocked",
        }
      );
      return {
        activation: {
          autoEnabled: false,
          restartRequired: false,
        },
        dryRunDiff,
        executionAvailable: false,
        issues: [...(validation?.diagnostics ?? []), ...policyDiagnostics],
        mutationPlan,
        nextSteps: [
          "Disable the plugin globally before package removal.",
          "Confirm tenant activation overrides are disabled or intentionally retained before removal.",
          "Retry only for discovered sourceType=package records.",
        ],
        operation: params.operation,
        pluginId: record.id,
        rollbackPolicy: baseRollbackPolicy(),
        status: "blocked",
        steps,
        validation: validation?.report,
      };
    }
  }

  if (!params.confirmPackageMutation) {
    const policyDiagnostic = confirmationRequiredDiagnostic(
      params.operation,
      record
    );
    params.registry.diagnostics.push(policyDiagnostic);
    steps.push(
      {
        details: {
          dryRunDiff,
          mutationPlan,
        },
        key: "mutation_plan",
        message:
          "Package-manager mutation target plan was generated without file changes.",
        status: "succeeded",
      },
      {
        diagnostics: [policyDiagnostic],
        key: "execution_policy",
        message: "Package-manager mutation requires explicit confirmation.",
        status: "blocked",
      },
      {
        details: baseRollbackPolicy(),
        key: "cleanup_policy",
        message:
          "No package files were changed; git review is required after any confirmed package-manager mutation.",
        status: "skipped",
      },
      {
        key: "result",
        message: "Package lifecycle execution was blocked before mutation.",
        status: "blocked",
      }
    );

    return {
      activation: {
        autoEnabled: false,
        restartRequired: false,
      },
      dryRunDiff,
      executionAvailable: true,
      issues: [...(validation?.diagnostics ?? []), policyDiagnostic],
      mutationPlan,
      nextSteps: deferredNextSteps(params.operation),
      operation: params.operation,
      pluginId: record.id,
      rollbackPolicy: baseRollbackPolicy(),
      status: "blocked",
      steps,
      validation: validation?.report,
    };
  }

  if (activePackageLifecycle) {
    const diagnostic = lifecycleInProgressDiagnostic({
      active: activePackageLifecycle,
      operation: params.operation,
      record,
    });
    params.registry.diagnostics.push(diagnostic);
    steps.push({
      diagnostics: [diagnostic],
      key: "execution_policy",
      message: "Package-manager mutation is already running.",
      status: "blocked",
    });
    return {
      activation: {
        autoEnabled: false,
        restartRequired: false,
      },
      dryRunDiff,
      executionAvailable: true,
      issues: [...(validation?.diagnostics ?? []), diagnostic],
      mutationPlan,
      nextSteps: ["Wait for the active package-manager operation to finish."],
      operation: params.operation,
      pluginId: record.id,
      rollbackPolicy: baseRollbackPolicy(),
      status: "blocked",
      steps,
      validation: validation?.report,
    };
  }

  const commandPlan = createCommandPlan({
    operation: params.operation,
    packageSpec: resolvedPackageSpec.packageSpec,
    workspaceRoot: params.workspaceRoot ?? process.cwd(),
  });
  if (!commandPlan) {
    const policyDiagnostic = executionDeferredDiagnostic(
      params.operation,
      record
    );
    params.registry.diagnostics.push(policyDiagnostic);
    steps.push({
      diagnostics: [policyDiagnostic],
      key: "execution_policy",
      message: "Package-manager mutation is not available.",
      status: "blocked",
    });
    return {
      activation: {
        autoEnabled: false,
        restartRequired: false,
      },
      dryRunDiff,
      executionAvailable: false,
      issues: [...(validation?.diagnostics ?? []), policyDiagnostic],
      mutationPlan,
      nextSteps: deferredNextSteps(params.operation),
      operation: params.operation,
      pluginId: record.id,
      rollbackPolicy: baseRollbackPolicy(),
      status: "blocked",
      steps,
      validation: validation?.report,
    };
  }

  steps.push(
    {
      details: {
        dryRunDiff,
        mutationPlan,
        commandPlan,
      },
      key: "mutation_plan",
      message: "Package-manager mutation target plan was generated.",
      status: "succeeded",
    },
    {
      key: "execution_policy",
      message: "Explicit package-manager mutation confirmation accepted.",
      status: "succeeded",
    }
  );

  let unload: UnloadOwnedRegistrationsResult | undefined;
  if (params.operation === "uninstall") {
    if (record.loaded && !params.unloadContext) {
      const diagnostic = unloadContextRequiredDiagnostic(record);
      params.registry.diagnostics.push(diagnostic);
      steps.push({
        diagnostics: [diagnostic],
        key: "runtime_unload",
        message: "Loaded plugin cannot be removed without runtime unload.",
        status: "blocked",
      });
      return {
        activation: {
          autoEnabled: false,
          restartRequired: false,
        },
        commandPlan,
        dryRunDiff,
        executionAvailable: true,
        issues: [...(validation?.diagnostics ?? []), diagnostic],
        mutationPlan,
        nextSteps: [
          "Retry through the admin API so runtime unload can run before pnpm remove.",
          "Resolve unload diagnostics before package removal.",
        ],
        operation: params.operation,
        pluginId: record.id,
        rollbackPolicy: baseRollbackPolicy(),
        status: "blocked",
        steps,
        validation: validation?.report,
      };
    }

    if (record.loaded && params.unloadContext) {
      const diagnosticsStart = params.registry.diagnostics.length;
      unload = await unloadOwnedRegistrations(params.registry, record.id, {
        ...params.unloadContext,
        pluginConfig: params.unloadContext.pluginConfig ?? {},
      });
      const unloadDiagnostics = params.registry.diagnostics
        .slice(diagnosticsStart)
        .filter((diagnostic) => diagnostic.pluginId === record.id);
      if (unload.blocked) {
        const diagnostic = unloadBlockedDiagnostic({ record, unload });
        params.registry.diagnostics.push(diagnostic);
        steps.push({
          details: unload,
          diagnostics: [...unloadDiagnostics, diagnostic],
          key: "runtime_unload",
          message: "Runtime unload blocked package removal.",
          status: "blocked",
        });
        return {
          activation: {
            autoEnabled: false,
            restartRequired: false,
          },
          commandPlan,
          dryRunDiff,
          executionAvailable: true,
          issues: [
            ...(validation?.diagnostics ?? []),
            ...unloadDiagnostics,
            diagnostic,
          ],
          mutationPlan,
          nextSteps: [
            "Resolve runtime unload diagnostics before package removal.",
            "No package files were changed.",
          ],
          operation: params.operation,
          pluginId: record.id,
          rollbackPolicy: baseRollbackPolicy(),
          status: "blocked",
          steps,
          unload,
          validation: validation?.report,
        };
      }
      record.loaded = false;
      record.loadError = undefined;
      steps.push({
        details: unload,
        diagnostics: unloadDiagnostics,
        key: "runtime_unload",
        message:
          "Loaded plugin runtime was stopped and owned registrations were disposed.",
        status: "succeeded",
      });
    } else {
      steps.push({
        key: "runtime_unload",
        message:
          "Plugin is already unloaded; no runtime disposal was required.",
        status: "skipped",
      });
    }
  }

  activePackageLifecycle = {
    operation: params.operation,
    pluginId: record.id,
  };
  const runner = params.runner ?? runPnpmPackageLifecycleCommand;
  let commandResult: PackageLifecycleCommandResult;
  try {
    commandResult = await runner(commandPlan);
  } catch (error) {
    commandResult = {
      args: commandPlan.args,
      command: commandPlan.command,
      cwd: commandPlan.cwd,
      durationMs: 0,
      exitCode: null,
      stderrSummary:
        error instanceof Error
          ? summarizeCommandOutput(error.message)
          : "Package-manager command failed before exit.",
      stdoutSummary: "",
    };
  } finally {
    activePackageLifecycle = undefined;
  }

  if (commandResult.exitCode !== 0) {
    const diagnostic = packageCommandFailedDiagnostic({
      operation: params.operation,
      record,
      result: commandResult,
    });
    params.registry.diagnostics.push(diagnostic);
    steps.push(
      {
        details: commandResult,
        diagnostics: [diagnostic],
        key: "command_execution",
        message: "pnpm package-manager command failed.",
        status: "failed",
      },
      {
        details: gitRollbackPolicy(),
        key: "cleanup_policy",
        message: "Use git status and git diff to inspect partial changes.",
        status: "succeeded",
      },
      {
        key: "result",
        message: "Package lifecycle execution failed during pnpm mutation.",
        status: "failed",
      }
    );
    return {
      activation: {
        autoEnabled: false,
        restartRequired: true,
      },
      commandPlan,
      commandResult,
      dryRunDiff,
      executionAvailable: true,
      issues: [...(validation?.diagnostics ?? []), diagnostic],
      mutationPlan,
      nextSteps: [
        "Review command output and git diff for partial package-manager changes.",
        "Fix or revert package.json and pnpm-lock.yaml with git before retrying.",
      ],
      operation: params.operation,
      pluginId: record.id,
      rollbackPolicy: gitRollbackPolicy(),
      status: "failed",
      steps,
      unload,
      validation: validation?.report,
    };
  }

  const diagnostic = packageCommandSucceededDiagnostic({
    operation: params.operation,
    record,
  });
  params.registry.diagnostics.push(diagnostic);
  if (params.operation === "uninstall") {
    const registryRecordRemoved = removeRegistryRecord(
      params.registry,
      record.id
    );
    steps.push(
      {
        details: commandResult,
        diagnostics: [diagnostic],
        key: "command_execution",
        message: "pnpm package-manager command completed.",
        status: "succeeded",
      },
      {
        details: {
          registryRecordRemoved,
          retainedData: "manual_review_required",
          retainedTenantActivation: "manual_review_required",
        },
        key: "cleanup_policy",
        message:
          "Package record was removed from the runtime registry; data, migrations, and tenant activation history remain manual review items.",
        status: "succeeded",
      },
      {
        key: "result",
        message:
          "Package lifecycle removal completed without deleting module data.",
        status: "succeeded",
      }
    );
    return {
      activation: {
        autoEnabled: false,
        restartRequired: false,
      },
      commandPlan,
      commandResult,
      dryRunDiff,
      executionAvailable: true,
      issues: [...(validation?.diagnostics ?? []), diagnostic],
      mutationPlan,
      nextSteps: [
        "Review git status and git diff for package.json and pnpm-lock.yaml.",
        "Commit accepted package-manager changes or revert them with git.",
        "Review retained module data and applied migrations manually; uninstall does not delete data.",
        "Review tenant activation overrides/history for the removed package identity.",
      ],
      operation: params.operation,
      pluginId: record.id,
      rollbackPolicy: gitRollbackPolicy(),
      status: "succeeded",
      steps,
      unload,
      validation: validation?.report,
    };
  }

  const discovery = discoverInstalledPackageAfterMutation({
    allowDiscoveredPluginId: isPackageAcquisition,
    operation: params.operation,
    packageName: packageNameFromSpec(commandPlan.packageSpec),
    record,
    registry: params.registry,
    workspaceRoot: commandPlan.cwd,
  });
  steps.push(
    {
      details: commandResult,
      diagnostics: [diagnostic],
      key: "command_execution",
      message: "pnpm package-manager command completed.",
      status: "succeeded",
    },
    {
      details: discovery,
      diagnostics: discovery.diagnostics,
      key: "post_install_discovery",
      message: discovery.loadable
        ? "Installed package discovery validated the package."
        : "Installed package discovery found blockers.",
      status: discovery.loadable ? "succeeded" : "failed",
    },
    {
      details: gitRollbackPolicy(),
      key: "cleanup_policy",
      message:
        "Package files are now owned by git review; data and migrations remain manual review items.",
      status: "succeeded",
    },
    {
      key: "result",
      message:
        "Package lifecycle mutation completed without enabling the plugin.",
      status: "succeeded",
    }
  );

  return {
    activation: {
      autoEnabled: false,
      restartRequired: discovery.restartRequired,
    },
    commandPlan,
    commandResult,
    discovery,
    dryRunDiff,
    executionAvailable: true,
    issues: [
      ...(validation?.diagnostics ?? []),
      diagnostic,
      ...discovery.diagnostics,
    ],
    mutationPlan,
    nextSteps: dedupeNextSteps([
      "Review git status and git diff for package.json and pnpm-lock.yaml.",
      "Commit accepted package-manager changes or revert them with git.",
      ...discovery.nextSteps,
    ]),
    operation: params.operation,
    pluginId: record.id,
    rollbackPolicy: gitRollbackPolicy(),
    status: "succeeded",
    steps,
    validation: validation?.report,
  };
}
