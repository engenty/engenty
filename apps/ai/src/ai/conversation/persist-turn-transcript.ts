// Durable write of a conversation turn at RUN TEARDOWN, for every exit path.
//
// Mastra memory flushes messages at end-of-generation and when a run PARKS on a
// native suspend. What it never covers is a turn that dies in between — a
// mid-stream failure or a cancel, both of which end the turn before the flush.
// There `saveMessages` never runs and the turn leaves NOTHING behind — not the
// assistant message, not even the user's own message.
//
// The parked paths are the callers' business, not ours: they pass
// `memoryFlushedAssistant: true` because writing an already-flushed turn would
// persist the same tool call twice, under two message ids and two part shapes.
//
// The consequence is more than a gap. Memory reads `ai.thread_message`
// (lastMessages fallback when OM is off), so the next turn starts from an EMPTY
// transcript — the model cannot know what it already did or asked, and repeats
// it.
//
// Called from the executor's `finally`, so completed / failed / suspended /
// aborted all persist the same way. Idempotent: the completed path has usually
// already been written by memory, and every write here is an upsert-or-update.
import type { ThreadStore } from "../../dal/threads/index.js";
import type { AiSessionScope } from "../sessions/types.js";
import { type TurnContext, turnContextMetadata } from "./turn-context.js";

export async function persistTurnTranscript(input: {
  attachmentParts?: readonly unknown[];
  /** Where the user turn was said — stamped on its row (turn-context.ts). */
  context?: TurnContext | null;
  /**
   * The run reached end-of-generation, so Mastra memory has already written this
   * turn's assistant message under its own id. Only the interrupted paths (and a
   * mid-stream failure) need us to write it.
   */
  memoryFlushedAssistant: boolean;
  prompt: string;
  runId: string;
  scope: AiSessionScope;
  store: ThreadStore;
  threadId: string;
  transcriptParts: readonly unknown[];
  userMessageId?: string | null;
}): Promise<void> {
  try {
    let rows = await input.store.listMessagesOrdered({
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });

    // The user turn. Memory normally inserts this under the client-assigned id
    // (see engenty-session-memory-storage's #userMessageId reuse), so matching on
    // that id is what keeps this from duplicating the bubble on the happy path.
    const userMessageId = input.userMessageId?.trim();
    const alreadyHasUserMessage = userMessageId
      ? rows.some((row) => row.id === userMessageId)
      : rows.some((row) => row.role === "user");
    if (
      !alreadyHasUserMessage &&
      (input.prompt.trim() || input.attachmentParts?.length)
    ) {
      const parts: unknown[] = [];
      if (input.prompt.trim()) {
        parts.push({ text: input.prompt, type: "text" });
      }
      if (input.attachmentParts?.length) {
        parts.push(...input.attachmentParts);
      }
      await input.store.appendMessage({
        authorUserId: input.scope.userId ?? null,
        ...(userMessageId ? { id: userMessageId } : {}),
        metadata: turnContextMetadata(input.context),
        parts,
        role: "user",
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
      });
      rows = await input.store.listMessagesOrdered({
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
      });
    }

    if (input.memoryFlushedAssistant || input.transcriptParts.length === 0) {
      return;
    }
    // Keyed by runId, so a turn NEVER overwrites an earlier turn's assistant row
    // (the generic "patch the last assistant message" helpers do exactly that on
    // a multi-turn thread) and a repeated teardown is a no-op upsert.
    const assistantMessageId = input.runId;
    const existing = rows.find((row) => row.id === assistantMessageId);
    if (existing) {
      await input.store.updateMessageParts({
        messageId: assistantMessageId,
        parts: input.transcriptParts as never,
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
      });
      return;
    }
    await input.store.appendMessage({
      authorUserId: null,
      id: assistantMessageId,
      parts: input.transcriptParts,
      role: "assistant",
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
  } catch (error) {
    // Never fail a run for its own bookkeeping — the turn already happened and
    // the user has seen it. Loud, because a silent miss is the original bug.
    console.error(
      `[conversation ${input.runId}] persisting turn transcript failed:`,
      error
    );
  }
}
