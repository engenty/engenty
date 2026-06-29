import { createHash } from "node:crypto";
import { isAgentThreadId } from "@engenty/ai-core";
import type { AiSessionScope } from "./types.js";

/** Stable RFC-4122 UUID from tenant + scope + stable key for session `getById` resolution. */
function deterministicSessionId(params: {
  scope: string;
  stable_key: string;
  tenant_id: string;
}): string {
  const payload = `${params.tenant_id}\0${params.scope}\0${params.stable_key}`;
  const hash = createHash("sha256").update(payload, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  // biome-ignore lint/suspicious/noBitwiseOperators: UUID layout from digest bytes
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  // biome-ignore lint/suspicious/noBitwiseOperators: UUID layout from digest bytes
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function resolveRequestedSessionId(params: {
  scope: AiSessionScope;
  sessionKey?: string | null;
  threadId?: string | null;
}) {
  const explicit = params.threadId?.trim();
  if (explicit) {
    return isAgentThreadId(explicit) ? explicit : null;
  }
  const stableKey = params.sessionKey?.trim();
  if (!stableKey) {
    return;
  }
  return deterministicSessionId({
    tenant_id: params.scope.tenantId,
    scope: params.scope.userId,
    stable_key: stableKey,
  });
}

export function buildRouteContext(params: {
  routeContext?: Record<string, unknown>;
  threadId: string;
  sessionKey?: string | null;
}) {
  const existingSessionKey = params.routeContext?.session_key;
  return {
    ...(params.routeContext ?? {}),
    thread_id: params.threadId,
    session_key:
      params.sessionKey?.trim() ||
      (typeof existingSessionKey === "string" && existingSessionKey.trim()
        ? existingSessionKey.trim()
        : params.threadId),
  };
}
