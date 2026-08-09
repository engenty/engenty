// Mark a tool call ANSWERED in persisted thread history. Used when the user
// resolves a decision/feedback (or tool-approval) interrupt: the `requestDecision`
// tool call otherwise lingers in history carrying only the QUESTION (the artifact)
// or a dangling `state:"call"`, so the model re-emits the same interrupt on every
// later turn ("repeats all previous requests"). This is the conversation analog of
// resolveResumedFrontendTool, but it matches by toolCallId regardless of the current
// state — a decision artifact is already at `state:"result"` with the question, which
// we overwrite with the answer. Best-effort: logs and returns on failure.
import type { ThreadStore } from "../../dal/threads/index.js";
import type { AiSessionScope } from "./types.js";

interface ToolInvocationPart {
  output?: unknown;
  state?: string;
  toolCallId?: string;
  toolInvocation?: {
    result?: unknown;
    state?: string;
    toolCallId?: string;
  };
  type?: string;
}

/**
 * Patch one part if it is the tool call we answered, in either persisted shape:
 * `tool-invocation` (what Mastra memory writes) or `dynamic-tool` (what the
 * executor's own transcript write produces on the paths memory cannot flush —
 * an aborted artifact turn or a mid-stream failure). Matching only the first
 * left the second spinning at `input-available` forever.
 */
function resolvePart(
  part: ToolInvocationPart,
  toolCallId: string,
  result: unknown
): ToolInvocationPart | null {
  const ti = part?.toolInvocation;
  if (part?.type === "tool-invocation" && ti?.toolCallId === toolCallId) {
    return {
      ...part,
      toolInvocation: { ...ti, result, state: "result" },
    };
  }
  if (part?.type === "dynamic-tool" && part.toolCallId === toolCallId) {
    return { ...part, output: result, state: "output-available" };
  }
  return null;
}

export async function resolveToolCallResultInHistory(input: {
  result: unknown;
  scope: AiSessionScope;
  store: ThreadStore;
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
        const resolved = resolvePart(part, input.toolCallId, input.result);
        if (!resolved) {
          return part;
        }
        changed = true;
        return resolved;
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
      // Every row carrying this call, not just the first. A tool call ids one
      // interaction, so a second row holding it is a duplicate of the same
      // question — and stopping early left that copy spinning forever.
    }
  } catch (error) {
    console.error(
      "[resolve-tool-call] failed to resolve answered tool call:",
      error
    );
  }
}
