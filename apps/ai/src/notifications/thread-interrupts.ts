// A desk interrupt as a notification: the card an agent parked on in a chat
// (`requestDecision`, `requestFeedback`, a gated tool call, a frontend tool)
// is a decision the people of that thread can answer, so it gets a row like
// every other parked run — written where the interrupt is persisted
// (`notifyThreadInterrupt`) and resolved wherever the thread's open interrupt
// is cleared (`resolveThreadInterruptNotifications`): answered, dismissed,
// moved past, or healed.
//
// Audience follows the thread's own access rule (thread-access.ts): a shared
// agent's space-visible thread → the space; a private room → its people; a
// personal agent's thread or one outside any space → its owner. The person
// whose turn parked is pre-seen — they are looking at the card.

import { humanizeOperationId } from "@engenty/notifications";
import { parseToolApprovalOperationId } from "../../ai/tools/engenty-tools/lib/tool-approval.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import type { ThreadStore } from "../dal/threads/index.js";
import { emitInboxNotification, resolveNotifications } from "./inbox.js";

export const THREAD_INTERRUPT_SUBJECT = "thread_interrupt";

export type ThreadInterruptAskKind = "tool_approval" | "agent_question";

export interface NotifyThreadInterruptInput {
  getAgentConfig?: (
    agentId: string
  ) => Promise<{ agentScope?: "personal" | "shared" | null } | undefined>;
  interruptId: string;
  kind: ThreadInterruptAskKind;
  runId?: string | null;
  scope: Pick<AiSessionScope, "tenantId" | "userId">;
  store: Pick<ThreadStore, "getThread" | "listUserParticipants">;
  threadId: string;
  title: string;
}

/** Write the decision record for a parked chat turn. Never throws. */
export async function notifyThreadInterrupt(
  input: NotifyThreadInterruptInput
): Promise<void> {
  try {
    const thread = await input.store.getThread({
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
    if (!thread) {
      return;
    }
    const owner = thread.created_by_user_id ?? null;
    const turnUser = input.scope.userId || null;
    let participantUserIds: string[] | null = null;
    let spaceId: string | null = null;
    if (thread.visibility === "private") {
      const people = await input.store.listUserParticipants({
        tenantId: input.scope.tenantId,
        threadId: input.threadId,
      });
      participantUserIds = [
        ...new Set(
          [owner, ...people.map((person) => person.user_id)].filter(
            (id): id is string => Boolean(id)
          )
        ),
      ];
    } else if (thread.space_id) {
      const config = await input.getAgentConfig?.(thread.agent_id);
      if (config?.agentScope === "shared") {
        spaceId = thread.space_id;
      } else {
        participantUserIds = owner ? [owner] : turnUser ? [turnUser] : null;
      }
    } else {
      participantUserIds = owner ? [owner] : turnUser ? [turnUser] : null;
    }
    if (!(spaceId || participantUserIds?.length)) {
      return;
    }
    const { body, operation, summary } = describeInterrupt(input);
    await emitInboxNotification({
      actor: { id: thread.agent_id, kind: "agent" },
      ...(body ? { body } : {}),
      dedupeKey: `${THREAD_INTERRUPT_SUBJECT}:${input.interruptId}`,
      kind: input.kind,
      metadata: {
        agent_id: thread.agent_id,
        interrupt_id: input.interruptId,
        thread_agent_id: thread.agent_id,
        thread_id: input.threadId,
        ...(input.runId ? { run_id: input.runId } : {}),
      },
      ...(participantUserIds ? { participantUserIds } : {}),
      ...(turnUser ? { preSeenUserIds: [turnUser] } : {}),
      priority: "high",
      source: "agents",
      spaceId: spaceId ?? thread.space_id ?? null,
      subject: { id: input.interruptId, type: THREAD_INTERRUPT_SUBJECT },
      subscribers: [owner, turnUser].filter((id): id is string => Boolean(id)),
      summary,
      tenantId: input.scope.tenantId,
      // `{actor}` is the thread's agent, resolved to its name at emit.
      title:
        input.kind === "tool_approval"
          ? { key: "tool_approval", params: { operation } }
          : { key: "agent_question" },
    });
  } catch (error) {
    console.error(
      `[thread-interrupt ${input.threadId}] notification failed:`,
      error
    );
  }
}

/**
 * What the row says about a parked card. A tool approval names the
 * operation, humanized from the id its artifact carries (a frontend tool's
 * interrupt has no such id — its card title is the tool's own label); the
 * card's title or question is the body, unless it only repeats the raw id.
 */
function describeInterrupt(
  input: Pick<NotifyThreadInterruptInput, "interruptId" | "kind" | "title">
): { body: string | null; operation: string; summary: string } {
  const cardTitle = input.title.trim();
  if (input.kind === "agent_question") {
    return {
      body: cardTitle || null,
      operation: "",
      summary: cardTitle || "An agent has a question",
    };
  }
  const operationId = parseToolApprovalOperationId(input.interruptId);
  const operation = operationId
    ? humanizeOperationId(operationId)
    : cardTitle
        .replace(/^Approve\s+/i, "")
        .replace(/\?$/, "")
        .trim() || "a tool";
  const echoesId =
    !cardTitle || (operationId !== null && cardTitle.includes(operationId));
  return {
    body: echoesId ? null : cardTitle,
    operation,
    summary: `Approval needed to use ${operation}`,
  };
}

/**
 * The thread's open interrupt is gone: `resumed` when it was answered,
 * `abandoned` when it was dismissed, moved past, or healed. Never throws.
 */
export async function resolveThreadInterruptNotifications(input: {
  interruptId: string | null | undefined;
  outcome: "resumed" | "abandoned";
  tenantId: string;
}): Promise<void> {
  if (!input.interruptId) {
    return;
  }
  await resolveNotifications({
    outcome: input.outcome,
    subjectId: input.interruptId,
    subjectType: THREAD_INTERRUPT_SUBJECT,
    tenantId: input.tenantId,
  });
}
