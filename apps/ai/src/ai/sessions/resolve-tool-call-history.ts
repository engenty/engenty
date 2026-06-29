// Mark a tool call ANSWERED in persisted thread history. Used when the user
// resolves a decision/feedback (or tool-approval) interrupt: the `requestDecision`
// tool call otherwise lingers in history carrying only the QUESTION (the artifact)
// or a dangling `state:"call"`, so the model re-emits the same interrupt on every
// later turn ("repeats all previous requests"). This is the conversation analog of
// resolveResumedFrontendTool, but it matches by toolCallId regardless of the current
// state — a decision artifact is already at `state:"result"` with the question, which
// we overwrite with the answer. Best-effort: logs and returns on failure.
import type { AgentSessionStore } from "../../dal/agent-sessions/index.js";
import type { AiSessionScope } from "./types.js";

interface ToolInvocationPart {
  toolInvocation?: {
    result?: unknown;
    state?: string;
    toolCallId?: string;
  };
  type?: string;
}

export async function resolveToolCallResultInHistory(input: {
  result: unknown;
  scope: AiSessionScope;
  store: AgentSessionStore;
  threadId: string;
  toolCallId: string;
}): Promise<void> {
  if (!input.toolCallId) {
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
        if (
          part?.type === "tool-invocation" &&
          ti?.toolCallId === input.toolCallId
        ) {
          changed = true;
          return {
            ...part,
            toolInvocation: { ...ti, result: input.result, state: "result" },
          };
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
      return;
    }
  } catch (error) {
    console.error(
      "[resolve-tool-call] failed to resolve answered tool call:",
      error
    );
  }
}
