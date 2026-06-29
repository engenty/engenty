import type { SecurityAuditLogAdapter } from "./audit-adapter.js";
import type { AuditContext, AuditEventPayload } from "./audit-types.js";

/**
 * Record an audit event originating from core.
 * Sets source_kind="core", source_module_id=null.
 */
export function recordCoreAuditEvent(
  adapter: SecurityAuditLogAdapter,
  event: AuditEventPayload,
  context?: AuditContext
): void {
  adapter.push({
    ...event,
    source_kind: "core",
    source_module_id: null,
    source_component: context?.component ?? null,
  });
}

/**
 * Record an audit event originating from a module/plugin.
 * Sets source_kind="module", source_module_id=moduleId.
 */
export function recordModuleAuditEvent(
  adapter: SecurityAuditLogAdapter,
  moduleId: string,
  event: AuditEventPayload,
  context?: AuditContext
): void {
  adapter.push({
    ...event,
    moduleId: event.moduleId ?? moduleId,
    source_kind: "module",
    source_module_id: moduleId,
    source_component: context?.component ?? null,
  });
}
