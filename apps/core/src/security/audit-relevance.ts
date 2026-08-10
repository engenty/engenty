import type { PluginOperationRisk } from "@engenty/plugin-sdk";

export type AuditMode = "always" | "never";

export interface AuditRelevanceInput {
  /** Explicit override from PluginOperationMeta.audit */
  audit?: AuditMode | null;
  method?: string | null;
  operationId?: string | null;
  path?: string | null;
  requiredCapabilities?: string[] | null;
  requiresApproval?: boolean | null;
  riskLevel?: PluginOperationRisk | null;
  type: string;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isFrameworkType(type: string): boolean {
  return (
    type.startsWith("policy.") ||
    type.startsWith("capability.") ||
    type.startsWith("operation.") ||
    type.startsWith("approval.") ||
    type.startsWith("auth.") ||
    type.startsWith("plugin.")
  );
}

/** Heartbeats, bridge polls, and similar infra chatter. */
export function isInfraNoiseOperation(
  operationId?: string | null,
  path?: string | null
): boolean {
  const id = (operationId ?? "").toLowerCase();
  const p = (path ?? "").toLowerCase();
  if (id.includes("heartbeat") || p.includes("/heartbeat")) {
    return true;
  }
  if (id.includes("/bridge/claim") || p.includes("/bridge/claim")) {
    return true;
  }
  return false;
}

function hasWriteCapability(caps: string[]): boolean {
  return caps.some(
    (c) => c.endsWith(".write") || c.includes(".write.") || c.endsWith(":write")
  );
}

function hasOnlyReadCapabilities(caps: string[]): boolean {
  if (caps.length === 0) {
    return false;
  }
  return caps.every(
    (c) =>
      c.endsWith(".read") ||
      c.includes(".read.") ||
      c.endsWith(".list") ||
      c.endsWith(".get")
  );
}

function isReadLikeOperationId(operationId: string): boolean {
  const id = operationId.toLowerCase();
  if (
    id.endsWith(".list") ||
    id.endsWith(".get") ||
    id.endsWith("_list") ||
    id.endsWith("_get") ||
    id.endsWith("_search") ||
    id.includes(".read") ||
    id.includes("_read_")
  ) {
    return true;
  }
  // Derived HTTP ids: `plugin.http.get./api/...`
  if (/\.http\.get\./i.test(operationId)) {
    return true;
  }
  return false;
}

function isMutatingHttp(method?: string | null): boolean {
  if (!method) {
    return false;
  }
  return MUTATING_METHODS.has(method.toUpperCase());
}

/**
 * Decide whether an audit event is worth persisting.
 * Domain (non-framework) types always record; routine policy.allow never does;
 * operation.executed is gated by risk / mutation / explicit audit mode.
 */
export function shouldRecordAudit(input: AuditRelevanceInput): boolean {
  const { type } = input;

  if (!isFrameworkType(type)) {
    return true;
  }

  if (type === "policy.allow") {
    return false;
  }

  if (
    type === "policy.deny" ||
    type === "capability.deny" ||
    type === "operation.rejected" ||
    type === "policy.require_approval" ||
    type.startsWith("approval.") ||
    type.startsWith("auth.") ||
    type.startsWith("plugin.")
  ) {
    return true;
  }

  if (type === "operation.executed") {
    return shouldRecordOperationExecuted(input);
  }

  return true;
}

function shouldRecordOperationExecuted(input: AuditRelevanceInput): boolean {
  if (input.audit === "never") {
    return false;
  }
  if (input.audit === "always") {
    return true;
  }
  if (isInfraNoiseOperation(input.operationId, input.path)) {
    return false;
  }
  if (input.requiresApproval) {
    return true;
  }
  if (input.riskLevel === "high" || input.riskLevel === "critical") {
    return true;
  }

  const caps = input.requiredCapabilities ?? [];
  if (hasWriteCapability(caps)) {
    return true;
  }

  const method = input.method?.toUpperCase() ?? null;
  if (method === "GET") {
    return false;
  }

  if (
    input.riskLevel === "low" &&
    (caps.length === 0 || hasOnlyReadCapabilities(caps))
  ) {
    return false;
  }

  if (isMutatingHttp(method)) {
    return true;
  }

  const operationId = input.operationId?.trim() ?? "";
  if (operationId && isReadLikeOperationId(operationId)) {
    return false;
  }

  // Gateway / inferred write at medium+ risk
  if (operationId && input.riskLevel !== "low") {
    return true;
  }

  return false;
}

export interface ExecutedAuditDetailInput {
  agentId?: string | null;
  goalId?: string | null;
  principalType?: string | null;
  riskLevel?: PluginOperationRisk | null;
  transport?: string | null;
}

/** Compact context stored on operation.executed rows. */
export function buildExecutedAuditDetail(
  input: ExecutedAuditDetailInput
): Record<string, unknown> {
  const detail: Record<string, unknown> = {};
  if (input.transport) {
    detail.transport = input.transport;
  }
  if (input.riskLevel) {
    detail.riskLevel = input.riskLevel;
  }
  if (input.principalType) {
    detail.principalType = input.principalType;
  }
  if (input.agentId) {
    detail.agentId = input.agentId;
  }
  if (input.goalId) {
    detail.goalId = input.goalId;
  }
  return detail;
}
