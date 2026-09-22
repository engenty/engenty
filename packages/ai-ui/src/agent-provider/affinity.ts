import type { EngentyAgUiRouteContext } from "../ag-ui/engenty-ag-ui-route-context.js";

export const MAX_AGENT_SESSION_STABLE_KEY_LENGTH = 512;

export interface EngentyAgentAffinityKeyInput {
  agentId: string;
  routeContext: EngentyAgUiRouteContext;
  tenantId: string | null | undefined;
  userId: string | null | undefined;
}

const AFFINITY_EXCLUDED_SCOPE_KEYS = new Set([
  "contact_snapshot",
  "copilotRequestedAgentId",
  "copilot_new_chat_generation",
  "project_snapshot",
  "task_snapshot",
  "tasks_briefing_snapshot",
  "tasks_preview",
  "ui_language",
]);

function normalizeString(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeUnknown);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, normalizeUnknown(record[key])])
    );
  }
  return value;
}

function hashStringFnv1a(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 2_147_483_647;
  }
  return Math.abs(hash).toString(36);
}

function slimScopeForAffinity(
  scope: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!scope) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(scope).filter(
      ([key]) => !AFFINITY_EXCLUDED_SCOPE_KEYS.has(key)
    )
  );
}

function normalizeScope(scope: Record<string, unknown> | undefined): string {
  const slim = slimScopeForAffinity(scope);
  if (Object.keys(slim).length === 0) {
    return "{}";
  }
  const serialized = JSON.stringify(normalizeUnknown(slim));
  if (serialized.length <= 160) {
    return serialized;
  }
  return `hash:${hashStringFnv1a(serialized)}`;
}

export function finalizeAgentSessionStableKey(
  key: string | null | undefined
): string | undefined {
  const trimmed = key?.trim() ?? "";
  if (!trimmed) {
    return;
  }
  if (trimmed.length <= MAX_AGENT_SESSION_STABLE_KEY_LENGTH) {
    return trimmed;
  }
  return `hash:${hashStringFnv1a(trimmed)}`.slice(
    0,
    MAX_AGENT_SESSION_STABLE_KEY_LENGTH
  );
}

export function resolveEngentyAgentAffinityStableSessionKey(
  input: EngentyAgentAffinityKeyInput
): string | null {
  const tenantId = normalizeString(input.tenantId);
  const userId = normalizeString(input.userId);
  const agentId = normalizeString(input.agentId);
  const moduleId = normalizeString(input.routeContext.moduleId);
  const routeKey = normalizeString(input.routeContext.routeKey);

  if (!(tenantId && userId && agentId && moduleId && routeKey)) {
    return null;
  }

  const rawKey = [
    "engenty-agent-affinity",
    "v1",
    tenantId,
    userId,
    agentId,
    moduleId,
    routeKey,
    normalizeString(input.routeContext.pathname),
    normalizeScope(input.routeContext.scope),
  ].join(":");

  return finalizeAgentSessionStableKey(rawKey) ?? null;
}
