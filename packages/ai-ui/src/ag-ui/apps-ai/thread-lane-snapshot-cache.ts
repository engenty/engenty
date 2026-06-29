// Per-thread in-memory lane snapshots when the user switches sidebar threads mid-run.
// Server runs continue; returning to the thread restores local transcript until recovery polls.

import type { EngentyAgUiMessage } from "../conversation.js";
import type { EngentyAgUiPendingSend } from "./use-engenty-ag-ui-apps-ai-session.js";

export type EngentyAgUiPanelStatus =
  | "ready"
  | "submitted"
  | "streaming"
  | "error";

export interface ThreadLaneSnapshot {
  messages: readonly EngentyAgUiMessage[];
  pendingSend: EngentyAgUiPendingSend;
  submitStatus: EngentyAgUiPanelStatus;
}

const threadLaneSnapshots = new Map<string, ThreadLaneSnapshot>();

export function isThreadLaneInFlight(input: {
  pendingSend: EngentyAgUiPendingSend;
  submitInFlight: boolean;
  submitStatus: EngentyAgUiPanelStatus;
}): boolean {
  if (input.submitInFlight) {
    return true;
  }
  if (input.pendingSend) {
    return true;
  }
  return (
    input.submitStatus === "submitted" || input.submitStatus === "streaming"
  );
}

export function saveThreadLaneSnapshot(
  threadId: string,
  snapshot: ThreadLaneSnapshot
): void {
  if (!isThreadLaneInFlight(snapshot)) {
    return;
  }
  threadLaneSnapshots.set(threadId, {
    messages: [...snapshot.messages],
    pendingSend: snapshot.pendingSend,
    submitStatus: snapshot.submitStatus,
  });
}

export function readThreadLaneSnapshot(
  threadId: string | null | undefined
): ThreadLaneSnapshot | null {
  const id = threadId?.trim() ?? "";
  if (!id) {
    return null;
  }
  const snapshot = threadLaneSnapshots.get(id);
  if (!snapshot) {
    return null;
  }
  return {
    messages: [...snapshot.messages],
    pendingSend: snapshot.pendingSend,
    submitStatus: snapshot.submitStatus,
  };
}

export function clearThreadLaneSnapshot(
  threadId: string | null | undefined
): void {
  const id = threadId?.trim() ?? "";
  if (!id) {
    return;
  }
  threadLaneSnapshots.delete(id);
}

/** Test-only reset — not exported from package index. */
export function resetThreadLaneSnapshotCacheForTests(): void {
  threadLaneSnapshots.clear();
}
