import type { EngentyAgUiMessage } from "../conversation.js";

function countDecisionToolMessages(
  messages: readonly EngentyAgUiMessage[]
): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "tool") {
      continue;
    }
    const content = typeof message.content === "string" ? message.content : "";
    if (
      content.includes("requestDecision") &&
      content.includes("artifact_id")
    ) {
      count += 1;
    }
  }
  return count;
}

/** Ignore HITL snapshots that drop a live requestDecision tool row. */
export function wouldSnapshotDropLiveDecisionTools(
  liveMessages: readonly EngentyAgUiMessage[],
  snapshotMessages: readonly EngentyAgUiMessage[]
): boolean {
  const liveDecisionTools = countDecisionToolMessages(liveMessages);
  if (liveDecisionTools === 0) {
    return false;
  }
  return countDecisionToolMessages(snapshotMessages) < liveDecisionTools;
}
