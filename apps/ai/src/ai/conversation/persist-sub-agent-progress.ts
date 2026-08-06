// Fold accumulated sub-agent progress lines back onto the persisted delegation
// tool part. Mastra memory lets persist message parts, which
// drops our app-level `progressLines` — the live `engenty.sub_agent.progress`
// CUSTOM events only patch the in-flight message, so on reload (or right after
// the run) the sub-agent card's Log panel + breadcrumb drill-in are empty. The
// legacy supervisor avoided this by persisting its own transcript parts with the
// lines folded in; the conversation executor patches the saved part after the run instead.
import type { ThreadStore } from "../../dal/threads/index.js";
import { isSubAgentDelegationToolName } from "../sessions/transcript.js";
import type { AiSessionScope } from "../sessions/types.js";

interface ToolInvocationPart {
  progressLines?: string[];
  toolInvocation?: { toolCallId?: string; toolName?: string };
  type?: string;
}

/**
 * Set `progressLines` on the persisted `agent-*` delegation tool part(s) for the
 * given run's accumulated lines (from `DurableAgUiConverter.getSubAgentProgressLines`).
 * The UI reads top-level `part.progressLines` (copilot-adapter `withProgressLines`).
 * Best-effort: only fills parts that don't already carry lines; logs and returns
 * on failure (a missing message just means no log this turn, not a crash).
 */
export async function persistSubAgentProgress(input: {
  progressByToolCallId: ReadonlyMap<string, string[]>;
  scope: AiSessionScope;
  store: ThreadStore;
  threadId: string;
}): Promise<void> {
  if (input.progressByToolCallId.size === 0) {
    return;
  }
  try {
    const rows = await input.store.listMessagesOrdered({
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
    for (const row of rows) {
      if (!Array.isArray(row.parts)) {
        continue;
      }
      let changed = false;
      const parts = (row.parts as ToolInvocationPart[]).map((part) => {
        const ti = part?.toolInvocation;
        const toolCallId = ti?.toolCallId;
        const toolName = ti?.toolName;
        const lines =
          typeof toolCallId === "string"
            ? input.progressByToolCallId.get(toolCallId)
            : undefined;
        if (
          part?.type === "tool-invocation" &&
          typeof toolName === "string" &&
          isSubAgentDelegationToolName(toolName) &&
          lines?.length &&
          !part.progressLines?.length
        ) {
          changed = true;
          return { ...part, progressLines: [...lines] };
        }
        return part;
      });
      if (!changed) {
        continue;
      }
      await input.store.updateMessageParts({
        messageId: row.id,
        parts: parts as never,
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
      });
    }
  } catch (error) {
    console.error("[conversation] persist sub-agent progress failed:", error);
  }
}
