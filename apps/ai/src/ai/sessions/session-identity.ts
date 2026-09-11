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

/** A UUID, and nothing else — the shape `core.spaces.id` is stored in. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The space a chat belongs to, read off the route context the client sent
 * (PLAN-spaces.md Phase C2).
 *
 * The UI puts it in `scope.space_id` because that is what the affinity key
 * hashes — the drawer opened in Marketing must not resume Company's thread, and
 * making the space part of the scope buys that with no extra wire field.
 *
 * **This value is client-supplied, and this function does not validate it
 * against the caller's accessible spaces.** That is sound for C2, which is
 * visibility only: a user can mislabel their OWN thread, and thread listing is
 * already filtered by participation, so a wrong id hides a chat from its author
 * rather than exposing anything.
 *
 * It stops being sound the moment the space selects what a run may reach, so
 * C3a does not trust this value either: `resolveRunSpace` hands the id to
 * core's `/surface` endpoint, which is gated by `requireSpaceAccess`, and a
 * claim the caller cannot back gets a 404 instead of a mount list. The
 * validation therefore lives where the access rule already lives, rather than
 * as a second membership list maintained here.
 *
 * Anything that is not a UUID is dropped rather than passed to Postgres, where
 * it would fail the insert and take the whole chat creation with it.
 */
export function spaceIdFromRouteContext(
  routeContext: Record<string, unknown> | undefined
): string | null {
  const scope = routeContext?.scope;
  if (!scope || typeof scope !== "object") {
    return null;
  }
  const raw = (scope as Record<string, unknown>).space_id;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
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
