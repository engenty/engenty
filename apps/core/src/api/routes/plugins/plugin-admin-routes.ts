import fs from "node:fs";
import path from "node:path";
import { unregisterAiRegistration } from "@engenty/ai-core";
import { getMandatoryPluginDeclaration } from "@engenty/environment";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { createPackagesDal } from "../../../dal/packages.js";
import {
  createTenantPluginOverridesDal,
  type TenantPluginOverridesDal,
} from "../../../dal/tenant-plugin-overrides.js";
import { resolvePluginEffectiveState } from "../../../plugins/capability-resolver.js";
import {
  validatePluginInstall,
  validatePluginReload,
  validatePluginUninstall,
} from "../../../plugins/install-validation.js";
import type { LoadPluginsParams } from "../../../plugins/loader.js";
import {
  executePluginPackageLifecycle,
  type PackageLifecycleOperation,
} from "../../../plugins/package-lifecycle-executor.js";
import type { PluginRegistry } from "../../../plugins/registry.js";
import { reloadBackendPlugin } from "../../../plugins/reload-executor.js";
import {
  resolvePluginStatePath,
  setPluginEnabledState,
} from "../../../plugins/state-store.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { jsonApiError, jsonApiSuccess } from "../api-response.js";
import { requireAuth, requireSuperAdmin } from "../authz.js";
import { recordPluginLifecycleAudit } from "./plugin-lifecycle-audit.js";

function getDbHealth(params: {
  loaded: boolean;
  loadError?: string;
  diagnostics: Array<{ level: "info" | "warn" | "error"; message: string }>;
}): "healthy" | "degraded" | "down" | "unknown" {
  const dbPattern = /\b(db|database|postgres|sql|supabase)\b/i;
  if (!params.loaded) {
    return params.loadError ? "down" : "unknown";
  }
  const dbErrors = params.diagnostics.some(
    (item) => item.level === "error" && dbPattern.test(item.message)
  );
  if (dbErrors) {
    return "down";
  }
  const dbWarns = params.diagnostics.some(
    (item) => item.level === "warn" && dbPattern.test(item.message)
  );
  if (dbWarns) {
    return "degraded";
  }
  return "healthy";
}

function createPackageLifecycleAuditRecord(params: {
  packageSpec?: string;
  pluginId: string;
}): PluginRegistry["plugins"][number] {
  return {
    id: params.pluginId,
    cliCommands: [],
    dependencies: [],
    enabled: false,
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    loaded: false,
    manifestPath: "",
    moduleOperations: [],
    packageName: params.packageSpec,
    queues: [],
    rootDir: "",
    services: [],
    source: "",
    sourceType: "package",
    testDataTypes: [],
  };
}

function isRemoteReference(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("//");
}

function isLocalRelativeReference(value: string) {
  return value.startsWith("./") || value.startsWith("../");
}

function isCompiledJavaScriptEntry(value: string) {
  return /\.(?:cjs|js|mjs)$/i.test(value);
}

function resolveLocalPluginPath(rootDir: string, reference: string) {
  if (!(isLocalRelativeReference(reference) && !isRemoteReference(reference))) {
    return;
  }
  return path.resolve(rootDir, reference);
}

function isPathInRoot(filePath: string, rootDir: string) {
  const relative = path.relative(path.resolve(rootDir), filePath);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function runtimeUiPolicyError(
  plugin: PluginRegistry["plugins"][number]
): { message: string; status: 403 | 404 | 409 } | null {
  const ui = plugin.ui;
  if (!ui || ui.enabled === false) {
    return { status: 404, message: "Plugin does not expose runtime UI." };
  }
  if (!(plugin.enabled && plugin.loaded)) {
    return { status: 409, message: "Plugin runtime UI is not active." };
  }
  if (plugin.capabilities?.ui !== true) {
    return {
      status: 403,
      message: "Plugin runtime UI requires capabilities.ui true.",
    };
  }
  if ((ui.load ?? "runtime") !== "runtime") {
    return {
      status: 404,
      message: "Plugin UI is not configured for runtime loading.",
    };
  }
  if (
    isRemoteReference(ui.entry) ||
    !(isLocalRelativeReference(ui.entry) && isCompiledJavaScriptEntry(ui.entry))
  ) {
    return {
      status: 403,
      message: "Plugin runtime UI entry is not a local JavaScript artifact.",
    };
  }
  if (
    (ui.staticAssets ?? []).some((asset) => isRemoteReference(asset)) ||
    (ui.assetOrigins ?? []).some((origin) => origin !== "self")
  ) {
    return {
      status: 403,
      message: "Plugin runtime UI asset origin is not trusted.",
    };
  }
  if (plugin.sourceType === "builtin") {
    return {
      status: 403,
      message: "Builtin plugin runtime UI serving is not enabled.",
    };
  }
  return null;
}

function runtimeUiHeaders(contentType: string) {
  return {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  };
}

export function registerPluginAdminRoutes(params: {
  auditLog?: SecurityAuditLogAdapter;
  app: OpenAPIHono;
  registry: PluginRegistry;
  dataDir: string;
  config: Record<string, unknown>;
  logger: NonNullable<LoadPluginsParams["logger"]>;
  resolvePath: (path: string) => string;
  tenantPluginOverrides?: TenantPluginOverridesDal;
  /**
   * Resolve a tenant's licensed module allow-list (from its commercial
   * package). `null` = no restriction. Injectable for tests; defaults to the
   * packages DAL and fails open (returns null) so a resolution error never
   * blocks activation.
   */
  resolvePackageAllowedModules?: (tenantId: string) => Promise<string[] | null>;
}) {
  const tenantOverridesDal =
    params.tenantPluginOverrides ??
    createTenantPluginOverridesDal(params.config);

  const resolvePackageAllowedModules =
    params.resolvePackageAllowedModules ??
    (async (tenantId: string) => {
      try {
        const resolved = await createPackagesDal(
          params.config
        ).getResolvedEntitlements(tenantId);
        return resolved.modules;
      } catch {
        return null; // fail open: never block activation on a resolution error
      }
    });

  const executePackageLifecycleRoute = async (
    c: Context,
    operation: PackageLifecycleOperation
  ) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = await c.req.json().catch(() => ({}));
    const packageSpec =
      typeof body.package_spec === "string" && body.package_spec.trim()
        ? body.package_spec.trim()
        : undefined;
    const requestedPluginId = c.req.param("id") ?? "";
    const plugin = params.registry.plugins.find(
      (item) => item.id === requestedPluginId
    );
    if (!(plugin || (operation === "install" && packageSpec))) {
      return jsonApiError(c, 404, { message: "Plugin not found" });
    }

    const result = await executePluginPackageLifecycle({
      confirmPackageMutation: body.confirm_package_mutation === true,
      operation,
      ...(packageSpec ? { packageSpec } : {}),
      pluginId: plugin?.id ?? requestedPluginId,
      registry: params.registry,
      unloadContext: {
        config: params.config,
        dataDir: params.dataDir,
        logger: params.logger,
        resolvePath: params.resolvePath,
      },
    });
    const status =
      result.status === "succeeded"
        ? "succeeded"
        : result.status === "failed"
          ? "failed"
          : "blocked";
    const auditPlugin =
      params.registry.plugins.find((item) => item.id === result.pluginId) ??
      plugin ??
      createPackageLifecycleAuditRecord({
        packageSpec,
        pluginId: result.pluginId,
      });
    const lifecycle = await recordPluginLifecycleAudit({
      auditLog: params.auditLog,
      auth: authResult.auth,
      detail: {
        activation: result.activation,
        commandPlan: result.commandPlan,
        commandResult: result.commandResult,
        discovery: result.discovery,
        executionAvailable: result.executionAvailable,
        mutationPlan: result.mutationPlan,
        nextSteps: result.nextSteps,
        rollbackPolicy: result.rollbackPolicy,
      },
      issues: result.issues,
      operation,
      plugin: auditPlugin,
      registry: params.registry,
      status,
      steps: result.steps,
    });

    if (result.status === "succeeded") {
      return jsonApiSuccess(c, { ...result, lifecycle });
    }
    if (result.status === "failed") {
      return jsonApiError(c, 500, {
        code: `plugin.${operation}.failed`,
        message: `Plugin package ${operation} failed: ${result.pluginId}`,
        details: { ...result, lifecycle },
      });
    }
    return jsonApiError(c, 409, {
      code: `plugin.${operation}.blocked`,
      message: `Plugin package ${operation} blocked: ${result.pluginId}`,
      details: { ...result, lifecycle },
    });
  };

  params.app.get("/api/plugins", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.query("tenantId") || undefined;
    const overrides = tenantId
      ? await tenantOverridesDal.getOverrides(tenantId)
      : {};

    const plugins = params.registry.plugins.map((plugin) => {
      const diagnostics = params.registry.diagnostics.filter(
        (item) => item.pluginId === plugin.id
      );
      const effectiveState = resolvePluginEffectiveState({
        capability: `plugin.${plugin.id}`,
        contributionKind: "ui_contribution",
        pluginId: plugin.id,
        registry: params.registry,
        tenantId,
        tenantPluginOverrides: overrides,
      });
      const enabled =
        plugin.id in overrides ? overrides[plugin.id] : plugin.enabled;
      const mandatoryDeclaration = getMandatoryPluginDeclaration(plugin.id);
      return {
        id: plugin.id,
        name: plugin.name ?? plugin.id,
        description: plugin.description,
        version: plugin.version,
        kind: plugin.kind,
        category: plugin.category,
        placement: plugin.placement,
        sourceType: plugin.sourceType,
        source: plugin.source,
        rootDir: plugin.rootDir,
        packageName: plugin.packageName,
        manifestPath: plugin.manifestPath,
        enabled,
        globalEnabled: plugin.enabled,
        generationId: plugin.generationId,
        tenantOverride:
          tenantId && plugin.id in overrides ? overrides[plugin.id] : null,
        tenantEnabled: effectiveState.tenantEnabled,
        mandatory: Boolean(mandatoryDeclaration),
        mandatoryReason: mandatoryDeclaration?.reason,
        mandatoryCapabilities: mandatoryDeclaration?.capabilities,
        capabilities: plugin.capabilities,
        hostHealthRelevant: effectiveState.hostHealthRelevant,
        effectiveState,
        loaded: plugin.loaded,
        loadError: plugin.loadError,
        ui: plugin.ui,
        dependencies: plugin.dependencies,
        optional: plugin.optional ?? [],
        provides: plugin.provides ?? [],
        requires: plugin.requires ?? [],
        routesCount: plugin.httpRoutes.length,
        servicesCount: plugin.services.length,
        methodsCount: plugin.gatewayMethods.length,
        operationsCount: plugin.moduleOperations.length,
        diagnosticsCount: diagnostics.length,
        dbHealth: getDbHealth({
          loaded: plugin.loaded,
          loadError: plugin.loadError,
          diagnostics,
        }),
      };
    });
    return jsonApiSuccess(c, plugins);
  });

  params.app.get("/api/plugins/:id/ui/plugin.js", async (c) => {
    const plugin = params.registry.plugins.find(
      (item) => item.id === c.req.param("id")
    );
    if (!plugin) {
      return c.text("Plugin not found", 404);
    }
    const policyError = runtimeUiPolicyError(plugin);
    if (policyError) {
      return c.text(policyError.message, policyError.status);
    }

    const entryPath = resolveLocalPluginPath(plugin.rootDir, plugin.ui!.entry);
    if (!(entryPath && isPathInRoot(entryPath, plugin.rootDir))) {
      return c.text(
        "Plugin runtime UI entry is outside the package root.",
        403
      );
    }

    if (fs.existsSync(entryPath)) {
      return new Response(fs.readFileSync(entryPath), {
        headers: runtimeUiHeaders("application/javascript; charset=utf-8"),
      });
    }

    return c.text("Plugin runtime UI entry artifact is missing.", 404);
  });

  params.app.get(
    "/api/plugins/:id/ui/assets/:assetIndex/:filename",
    async (c) => {
      const plugin = params.registry.plugins.find(
        (item) => item.id === c.req.param("id")
      );
      if (!plugin) {
        return c.text("Plugin not found", 404);
      }
      const policyError = runtimeUiPolicyError(plugin);
      if (policyError) {
        return c.text(policyError.message, policyError.status);
      }

      const assetIndex = Number.parseInt(c.req.param("assetIndex"), 10);
      const asset = plugin.ui?.staticAssets?.[assetIndex];
      if (!asset) {
        return c.text("Plugin runtime UI asset not found.", 404);
      }
      const assetPath = resolveLocalPluginPath(plugin.rootDir, asset);
      if (!(assetPath && isPathInRoot(assetPath, plugin.rootDir))) {
        return c.text(
          "Plugin runtime UI asset is outside the package root.",
          403
        );
      }
      if (!fs.existsSync(assetPath)) {
        return c.text("Plugin runtime UI asset is missing.", 404);
      }
      const contentType =
        path.extname(assetPath).toLowerCase() === ".css"
          ? "text/css; charset=utf-8"
          : "application/octet-stream";
      return new Response(fs.readFileSync(assetPath), {
        headers: runtimeUiHeaders(contentType),
      });
    }
  );

  params.app.get("/api/plugins/:id/install-report", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const plugin = params.registry.plugins.find(
      (item) => item.id === c.req.param("id")
    );
    if (!plugin) {
      return jsonApiError(c, 404, { message: "Plugin not found" });
    }
    const report = validatePluginInstall({
      packageName: plugin.packageName,
      pluginId: plugin.id,
      registry: params.registry,
      rootDir: plugin.rootDir,
      sourceType: plugin.sourceType,
    });
    const lifecycle = await recordPluginLifecycleAudit({
      auditLog: params.auditLog,
      auth: authResult.auth,
      detail: {
        installable: report.installable,
        migrationReviewRequired: report.migrationReviewRequired,
        trustLevel: report.trust.level,
      },
      issues: report.issues,
      operation: "install_report",
      plugin,
      registry: params.registry,
      status: report.installable ? "reported" : "blocked",
    });
    return jsonApiSuccess(c, { ...report, lifecycle });
  });

  params.app.get("/api/plugins/:id/uninstall-report", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const plugin = params.registry.plugins.find(
      (item) => item.id === c.req.param("id")
    );
    if (!plugin) {
      return jsonApiError(c, 404, { message: "Plugin not found" });
    }
    const report = validatePluginUninstall({
      pluginId: plugin.id,
      registry: params.registry,
    });
    const lifecycle = await recordPluginLifecycleAudit({
      auditLog: params.auditLog,
      auth: authResult.auth,
      detail: {
        removableAtRuntime: report.removableAtRuntime,
        requiresRestart: report.requiresRestart,
      },
      issues: report.issues,
      operation: "uninstall_report",
      plugin,
      registry: params.registry,
      status: report.removableAtRuntime ? "reported" : "blocked",
    });
    return jsonApiSuccess(c, { ...report, lifecycle });
  });

  params.app.post("/api/plugins/:id/install", async (c) =>
    executePackageLifecycleRoute(c, "install")
  );

  params.app.post("/api/plugins/:id/update", async (c) =>
    executePackageLifecycleRoute(c, "update")
  );

  params.app.post("/api/plugins/:id/uninstall", async (c) =>
    executePackageLifecycleRoute(c, "uninstall")
  );

  params.app.get("/api/plugins/:id/reload-report", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const plugin = params.registry.plugins.find(
      (item) => item.id === c.req.param("id")
    );
    if (!plugin) {
      return jsonApiError(c, 404, { message: "Plugin not found" });
    }
    const report = validatePluginReload({
      pluginId: plugin.id,
      registry: params.registry,
    });
    const lifecycle = await recordPluginLifecycleAudit({
      auditLog: params.auditLog,
      auth: authResult.auth,
      detail: {
        executionAvailable: report.executionAvailable,
        generationId: report.generationId,
        nextGenerationId: report.nextGenerationId,
        preflightPassed: report.preflightPassed,
        requiresRestart: report.requiresRestart,
      },
      issues: report.issues,
      operation: "reload_report",
      plugin,
      registry: params.registry,
      status: report.preflightPassed ? "reported" : "blocked",
      steps: report.steps.map((step) => ({
        key: step.key,
        status: step.implemented ? "implemented" : "pending",
      })),
    });
    return jsonApiSuccess(c, { ...report, lifecycle });
  });

  params.app.post("/api/plugins/:id/reload", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const plugin = params.registry.plugins.find(
      (item) => item.id === c.req.param("id")
    );
    if (!plugin) {
      return jsonApiError(c, 404, { message: "Plugin not found" });
    }
    const body = await c.req.json().catch(() => ({}));
    const tenantId =
      typeof body.tenant_id === "string" && body.tenant_id.trim()
        ? body.tenant_id.trim()
        : undefined;

    const result = await reloadBackendPlugin({
      config: params.config,
      dataDir: params.dataDir,
      logger: params.logger,
      pluginId: plugin.id,
      registry: params.registry,
      resolvePath: params.resolvePath,
      resolveTenantPluginOverrides: (tenantId) =>
        tenantOverridesDal.getOverrides(tenantId),
      ...(tenantId ? { tenantId } : {}),
    });
    const lifecycle = await recordPluginLifecycleAudit({
      auditLog: params.auditLog,
      auth: authResult.auth,
      detail: {
        generationId: result.generationId,
        nextGenerationId: result.nextGenerationId,
        serviceStarts: result.serviceStarts,
        status: result.status,
      },
      issues: result.issues,
      operation: "reload",
      plugin,
      registry: params.registry,
      status:
        result.status === "reloaded"
          ? "succeeded"
          : result.status === "blocked"
            ? "blocked"
            : "failed",
      steps: result.steps,
      ...(tenantId ? { tenantId } : {}),
    });

    if (result.status === "blocked") {
      return jsonApiError(c, 409, {
        code: "plugin.reload.blocked",
        message: `Plugin reload blocked: ${plugin.id}`,
        details: { ...result, lifecycle },
      });
    }
    if (result.status === "failed") {
      return jsonApiError(c, 500, {
        code: "plugin.reload.failed",
        message: `Plugin reload failed: ${plugin.id}`,
        details: { ...result, lifecycle },
      });
    }
    return jsonApiSuccess(c, { ...result, lifecycle });
  });

  params.app.get("/api/plugins/:id", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const plugin = params.registry.plugins.find(
      (item) => item.id === c.req.param("id")
    );
    if (!plugin) {
      return jsonApiError(c, 404, { message: "Plugin not found" });
    }
    const tenantId = c.req.query("tenantId") || undefined;
    const overrides = tenantId
      ? await tenantOverridesDal.getOverrides(tenantId)
      : {};
    const diagnostics = params.registry.diagnostics.filter(
      (item) => item.pluginId === plugin.id
    );
    const effectiveState = resolvePluginEffectiveState({
      capability: `plugin.${plugin.id}`,
      contributionKind: "ui_contribution",
      pluginId: plugin.id,
      registry: params.registry,
      tenantId,
      tenantPluginOverrides: overrides,
    });
    return jsonApiSuccess(c, {
      ...plugin,
      effectiveState,
      globalEnabled: plugin.enabled,
      mandatory: effectiveState.mandatory,
      mandatoryReason: effectiveState.mandatoryReason,
      mandatoryCapabilities: effectiveState.mandatoryCapabilities,
      hostHealthRelevant: effectiveState.hostHealthRelevant,
      tenantOverride:
        tenantId && plugin.id in overrides ? overrides[plugin.id] : null,
      tenantEnabled: effectiveState.tenantEnabled,
      diagnostics,
    });
  });

  params.app.post("/api/plugins/:id/activate", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const plugin = params.registry.plugins.find(
      (item) => item.id === c.req.param("id")
    );
    if (!plugin) {
      return jsonApiError(c, 404, { message: "Plugin not found" });
    }
    const body = await c.req.json().catch(() => ({}));
    const tenantId =
      typeof body.tenant_id === "string" && body.tenant_id.trim()
        ? body.tenant_id.trim()
        : undefined;

    if (tenantId) {
      const overrides = await tenantOverridesDal.getOverrides(tenantId);
      const packageAllowedModules =
        await resolvePackageAllowedModules(tenantId);
      const effectiveState = resolvePluginEffectiveState({
        capability: `plugin.${plugin.id}`,
        contributionKind: "ui_contribution",
        pluginId: plugin.id,
        registry: params.registry,
        tenantId,
        tenantPluginOverrides: {
          ...overrides,
          [plugin.id]: true,
        },
        packageAllowedModules,
      });
      if (!effectiveState.allowed) {
        const lifecycle = await recordPluginLifecycleAudit({
          auditLog: params.auditLog,
          auth: authResult.auth,
          detail: {
            blockedReasons: effectiveState.blockedReasons,
            scope: "tenant",
          },
          issues: effectiveState.diagnostics,
          operation: "enable",
          plugin,
          registry: params.registry,
          status: "blocked",
          tenantId,
        });
        return jsonApiError(c, 409, {
          code: "plugin.tenant_activation.blocked",
          message: `Plugin cannot be enabled for tenant: ${plugin.id}`,
          details: {
            blockedReasons: effectiveState.blockedReasons,
            diagnostics: effectiveState.diagnostics,
            lifecycle,
            pluginId: plugin.id,
            tenantId,
          },
        });
      }
      await tenantOverridesDal.setOverride(tenantId, plugin.id, true);
      const lifecycle = await recordPluginLifecycleAudit({
        auditLog: params.auditLog,
        auth: authResult.auth,
        detail: { scope: "tenant" },
        operation: "enable",
        plugin,
        registry: params.registry,
        status: "succeeded",
        tenantId,
      });
      return jsonApiSuccess(c, {
        pluginId: plugin.id,
        enabled: true,
        lifecycle,
        restartRequired: false,
        updatedAt: new Date().toISOString(),
        message: "Plugin enabled for tenant.",
      });
    }

    const state = setPluginEnabledState(
      resolvePluginStatePath(params.dataDir),
      plugin.id,
      true
    );
    plugin.enabled = true;
    const lifecycle = await recordPluginLifecycleAudit({
      auditLog: params.auditLog,
      auth: authResult.auth,
      detail: { scope: "global" },
      operation: "enable",
      plugin,
      registry: params.registry,
      status: "succeeded",
    });
    return jsonApiSuccess(c, {
      pluginId: plugin.id,
      enabled: true,
      lifecycle,
      restartRequired: true,
      updatedAt:
        state.plugins[plugin.id]?.updatedAt ?? new Date().toISOString(),
      message:
        "Plugin activation persisted. Restart API runtime to apply route/service changes.",
    });
  });

  params.app.post("/api/plugins/:id/deactivate", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const plugin = params.registry.plugins.find(
      (item) => item.id === c.req.param("id")
    );
    if (!plugin) {
      return jsonApiError(c, 404, { message: "Plugin not found" });
    }
    const body = await c.req.json().catch(() => ({}));
    const tenantId =
      typeof body.tenant_id === "string" && body.tenant_id.trim()
        ? body.tenant_id.trim()
        : undefined;

    const mandatoryDeclaration = getMandatoryPluginDeclaration(plugin.id);
    if (mandatoryDeclaration) {
      const lifecycle = await recordPluginLifecycleAudit({
        auditLog: params.auditLog,
        auth: authResult.auth,
        detail: {
          mandatoryCapabilities: mandatoryDeclaration.capabilities,
          scope: tenantId ? "tenant" : "global",
          ...(tenantId ? { tenantId } : {}),
        },
        issues: [
          {
            code: "plugin.mandatory.deactivation_blocked",
            level: "error",
          },
        ],
        operation: "disable",
        plugin,
        registry: params.registry,
        status: "blocked",
        tenantId,
      });
      return jsonApiError(c, 409, {
        code: "plugin.mandatory.deactivation_blocked",
        message: tenantId
          ? `Mandatory plugin cannot be disabled for tenant: ${plugin.id}`
          : `Mandatory plugin cannot be globally deactivated: ${plugin.id}`,
        details: {
          capabilities: mandatoryDeclaration.capabilities,
          hostHealthRelevant: mandatoryDeclaration.hostHealthRelevant,
          lifecycle,
          pluginId: plugin.id,
          reason: mandatoryDeclaration.reason,
          ...(tenantId ? { tenantId } : {}),
        },
      });
    }

    if (tenantId) {
      await tenantOverridesDal.setOverride(tenantId, plugin.id, false);
      const lifecycle = await recordPluginLifecycleAudit({
        auditLog: params.auditLog,
        auth: authResult.auth,
        detail: { scope: "tenant" },
        operation: "disable",
        plugin,
        registry: params.registry,
        status: "succeeded",
        tenantId,
      });
      return jsonApiSuccess(c, {
        pluginId: plugin.id,
        enabled: false,
        lifecycle,
        restartRequired: false,
        updatedAt: new Date().toISOString(),
        message: "Plugin disabled for tenant.",
      });
    }

    const state = setPluginEnabledState(
      resolvePluginStatePath(params.dataDir),
      plugin.id,
      false
    );
    plugin.enabled = false;
    unregisterAiRegistration(plugin.id);
    const lifecycle = await recordPluginLifecycleAudit({
      auditLog: params.auditLog,
      auth: authResult.auth,
      detail: { scope: "global" },
      operation: "disable",
      plugin,
      registry: params.registry,
      status: "succeeded",
    });
    return jsonApiSuccess(c, {
      pluginId: plugin.id,
      enabled: false,
      lifecycle,
      restartRequired: true,
      updatedAt:
        state.plugins[plugin.id]?.updatedAt ?? new Date().toISOString(),
      message:
        "Plugin deactivation persisted. Restart API runtime to apply route/service changes.",
    });
  });
}
