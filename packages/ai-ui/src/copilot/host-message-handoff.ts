/**
 * Router state key used to carry a message into any agent host.
 *
 * Router state is only the fast path. The host-keyed sessionStorage copy
 * survives redirects, query-string binding, and a remount during first send.
 */
export const HOST_MESSAGE_HANDOFF_STATE = "pendingHostMessage";

export function pendingHostMessageStorageKey(hostKey: string): string {
  return `engenty:${hostKey}:pending-host-message`;
}

export function pendingHostMessageFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }
  const raw = (state as Record<string, unknown>)[HOST_MESSAGE_HANDOFF_STATE];
  return typeof raw === "string" && raw.trim() ? raw : null;
}

export function readPendingHostMessage(hostKey: string): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(pendingHostMessageStorageKey(hostKey));
    return raw?.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function writePendingHostMessage(hostKey: string, text: string): void {
  if (!text.trim() || typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(pendingHostMessageStorageKey(hostKey), text);
  } catch {
    // private mode / quota
  }
}

export function clearPendingHostMessage(hostKey: string): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(pendingHostMessageStorageKey(hostKey));
  } catch {
    // private mode / quota
  }
}

export function resolvePendingHostMessage(
  hostKey: string,
  state: unknown
): string | null {
  return pendingHostMessageFromState(state) ?? readPendingHostMessage(hostKey);
}
