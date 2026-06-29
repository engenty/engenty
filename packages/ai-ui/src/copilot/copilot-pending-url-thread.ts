import { isAgentThreadId } from "@engenty/ai-core/browser";

/** Survives reload until full-page URL catches up after first-send thread assign. */
export const PENDING_COPILOT_URL_THREAD_STORAGE_KEY =
  "engenty:copilot:pending-url-thread";

function trimOrEmpty(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function readPendingCopilotUrlThreadId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.sessionStorage
      .getItem(PENDING_COPILOT_URL_THREAD_STORAGE_KEY)
      ?.trim();
    return stored && isAgentThreadId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writePendingCopilotUrlThreadId(threadId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const id = trimOrEmpty(threadId);
    if (id && isAgentThreadId(id)) {
      window.sessionStorage.setItem(PENDING_COPILOT_URL_THREAD_STORAGE_KEY, id);
      return;
    }
    window.sessionStorage.removeItem(PENDING_COPILOT_URL_THREAD_STORAGE_KEY);
  } catch {
    // private mode / quota
  }
}

export function clearPendingCopilotUrlThread(): void {
  writePendingCopilotUrlThreadId(null);
}

export function resolvePendingCopilotUrlThreadId(input: {
  pendingNavigateThreadIdRef: { current: string | null };
}): string | null {
  return (
    input.pendingNavigateThreadIdRef.current ?? readPendingCopilotUrlThreadId()
  );
}

export function clearPendingCopilotUrlThreadState(input: {
  pendingNavigateThreadIdRef: { current: string | null };
}): void {
  input.pendingNavigateThreadIdRef.current = null;
  clearPendingCopilotUrlThread();
}

export function setPendingCopilotUrlThreadState(
  pendingNavigateThreadIdRef: { current: string | null },
  threadId: string
): void {
  pendingNavigateThreadIdRef.current = threadId;
  writePendingCopilotUrlThreadId(threadId);
}
