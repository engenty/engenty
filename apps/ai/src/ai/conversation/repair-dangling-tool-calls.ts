// Answer tool calls that were persisted with no result.
//
// Mastra writes the assistant message with a `state:"call"` tool-invocation part
// as soon as the model emits the call. When the call never executes — a
// hallucinated tool name has nothing to dispatch — that part stays at "call"
// forever. Two consequences, both silent:
//   - the chat card renders as permanently pending on every later reload;
//   - the model reads its own unanswered call each turn and, having never been
//     told it failed, invents the same tool again.
//
// So before a fresh turn runs, every dangling call is answered with a tool ERROR
// result. The next turn's history then contains the correction, which is the
// only thing that makes the model stop.
//
// NOT repaired: the tool call of the currently open interrupt. That one is
// legitimately unanswered — a parked frontend tool / approval gate waiting on
// the user — and writing a failure there would resolve an interrupt the user is
// still looking at.
import type { ThreadStore } from "../../dal/threads/index.js";
import type { AiSessionScope } from "../sessions/types.js";
import { buildUnresolvedToolCallResult } from "./unresolved-tool-call.js";

interface ToolInvocationPart {
  toolInvocation?: {
    result?: unknown;
    state?: string;
    toolCallId?: string;
    toolName?: string;
  };
  type?: string;
}

export async function repairDanglingToolCallsInHistory(input: {
  knownToolNames?: readonly string[];
  scope: AiSessionScope;
  skipToolCallIds?: readonly string[];
  store: ThreadStore;
  threadId: string;
}): Promise<{ toolCallId: string; toolName: string }[]> {
  const repaired: { toolCallId: string; toolName: string }[] = [];
  const skip = new Set(
    (input.skipToolCallIds ?? []).filter((id): id is string => Boolean(id))
  );
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
          part?.type !== "tool-invocation" ||
          !ti ||
          typeof ti.toolCallId !== "string" ||
          // Anything already carrying a result is done, whatever its state
          // string says. Only "call" (and its partial-args sibling) dangle.
          ti.state === "result" ||
          skip.has(ti.toolCallId)
        ) {
          return part;
        }
        const toolName =
          typeof ti.toolName === "string" && ti.toolName.trim()
            ? ti.toolName.trim()
            : "tool";
        changed = true;
        repaired.push({ toolCallId: ti.toolCallId, toolName });
        return {
          ...part,
          toolInvocation: {
            ...ti,
            result: buildUnresolvedToolCallResult({
              ...(input.knownToolNames
                ? { knownToolNames: input.knownToolNames }
                : {}),
              toolName,
            }),
            state: "result",
          },
        };
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
    // Best-effort, exactly like resolveToolCallResultInHistory: a repair
    // failure must never take down the turn the user is waiting on.
    console.error(
      "[repair-dangling-tool-calls] failed to answer dangling tool calls:",
      error
    );
  }
  return repaired;
}
