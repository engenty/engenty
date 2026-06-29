import type { PluginDiagnostic } from "@engenty/plugin-sdk";
import type {
  PluginRecord,
  PluginRegistry,
} from "../../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { recordCoreAuditEvent } from "../../../security/audit-service.js";
import type { ResolvedRouteAuth } from "../authz.js";

export type PluginLifecycleOperation =
  | "disable"
  | "enable"
  | "install"
  | "install_report"
  | "reload"
  | "reload_report"
  | "uninstall"
  | "uninstall_report"
  | "update";

export type PluginLifecycleStatus =
  | "blocked"
  | "failed"
  | "reported"
  | "succeeded";

export interface PluginLifecycleDiagnostic {
  diagnostic: PluginDiagnostic;
  operation: PluginLifecycleOperation;
  order: number;
  status: PluginLifecycleStatus;
}

export interface PluginLifecycleAuditSummary {
  diagnostics: PluginLifecycleDiagnostic[];
  eventType: string;
  operation: PluginLifecycleOperation;
  status: PluginLifecycleStatus;
}

interface IssueLike {
  code: string;
  level: "error" | "info" | "warn";
}

interface StepLike {
  key: string;
  status?: string;
}

function issueLevelCounts(issues: IssueLike[] = []) {
  return issues.reduce(
    (counts, issue) => {
      counts[issue.level] += 1;
      return counts;
    },
    { error: 0, info: 0, warn: 0 }
  );
}

function operationLabel(operation: PluginLifecycleOperation) {
  return operation.replaceAll("_", " ");
}

function lifecycleEventType(params: {
  operation: PluginLifecycleOperation;
  status: PluginLifecycleStatus;
}) {
  return `plugin.${params.operation}.${params.status}`;
}

function lifecycleDiagnosticLevel(
  status: PluginLifecycleStatus
): PluginDiagnostic["level"] {
  if (status === "failed" || status === "blocked") {
    return "warn";
  }
  return "info";
}

function lifecycleDiagnosticMessage(params: {
  operation: PluginLifecycleOperation;
  pluginId: string;
  status: PluginLifecycleStatus;
}) {
  return `Plugin ${operationLabel(params.operation)} ${params.status}: ${params.pluginId}`;
}

function safeIssueCodes(issues: IssueLike[] = []) {
  return issues.map((issue) => issue.code);
}

function safeStepStatuses(steps: StepLike[] = []) {
  return steps.map((step) => ({
    key: step.key,
    status: step.status,
  }));
}

async function emitReloadLifecycleEvent(params: {
  auth: ResolvedRouteAuth;
  detail: Record<string, unknown>;
  plugin: PluginRecord;
  registry: PluginRegistry;
  status: PluginLifecycleStatus;
  tenantId?: string;
}) {
  await params.registry.eventsRuntime?.api.core.emit(
    "plugin.reload",
    {
      generation_id: params.detail.generationId,
      issue_codes: params.detail.issueCodes,
      next_generation_id: params.detail.nextGenerationId,
      plugin_id: params.plugin.id,
      status: params.status,
      step_statuses: params.detail.stepStatuses,
    },
    {
      actorId: params.auth.userId ?? undefined,
      sourceModuleId: "engenty-core",
      tenantId: params.tenantId ?? params.auth.tenantId ?? undefined,
    }
  );
}

export async function recordPluginLifecycleAudit(params: {
  auditLog?: SecurityAuditLogAdapter;
  auth: ResolvedRouteAuth;
  detail?: Record<string, unknown>;
  issues?: IssueLike[];
  operation: PluginLifecycleOperation;
  plugin: PluginRecord;
  registry: PluginRegistry;
  status: PluginLifecycleStatus;
  steps?: StepLike[];
  tenantId?: string;
}): Promise<PluginLifecycleAuditSummary> {
  const eventType = lifecycleEventType(params);
  const issueCodes = safeIssueCodes(params.issues);
  const stepStatuses = safeStepStatuses(params.steps);
  const detail = {
    issueCodes,
    issueLevelCounts: issueLevelCounts(params.issues),
    packageName: params.plugin.packageName,
    pluginId: params.plugin.id,
    sourceType: params.plugin.sourceType,
    stepStatuses,
    ...params.detail,
  };
  const diagnostic: PluginDiagnostic = {
    code: eventType,
    level: lifecycleDiagnosticLevel(params.status),
    message: lifecycleDiagnosticMessage({
      operation: params.operation,
      pluginId: params.plugin.id,
      status: params.status,
    }),
    pluginId: params.plugin.id,
    sourceInfo: params.plugin.sourceInfo,
  };
  params.registry.diagnostics.push(diagnostic);
  if (params.auditLog) {
    recordCoreAuditEvent(
      params.auditLog,
      {
        actorId: params.auth.userId ?? undefined,
        detail,
        moduleId: params.plugin.id,
        tenantId: params.tenantId ?? params.auth.tenantId ?? undefined,
        type: eventType,
      },
      { component: "plugin-admin-routes" }
    );
  }

  if (params.operation === "reload") {
    await emitReloadLifecycleEvent({
      auth: params.auth,
      detail,
      plugin: params.plugin,
      registry: params.registry,
      status: params.status,
      tenantId: params.tenantId,
    });
  }

  return {
    diagnostics: [
      {
        diagnostic,
        operation: params.operation,
        order: 1,
        status: params.status,
      },
    ],
    eventType,
    operation: params.operation,
    status: params.status,
  };
}
