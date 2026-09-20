// Where a background run speaks: the specialist's shared conversation in a
// Space — the thread its desk opens for everyone.
//
// Anything a run wants a human to SEE goes here — a routine's settle report, a
// hand-off line, a graph node's rendered card — because this is the room the
// desk opens by default (`resolveAgentDeskDefault`: the agent's newest
// conversation, whoever started it). A shared specialist's desk is one
// conversation for the whole Space, so the message lands where every member
// reads, not in a thread seeded for one person. The person still matters for
// the notification and, on first contact, as the row's owner.
//
// The run keeps its own thread either way. What lands here is a message ABOUT
// the run, not a move of it.
import type { ThreadStore } from "../../dal/threads/thread-store.js";
import { preservedThreadUpsertFields } from "../../dal/threads/thread-upsert-preserve.js";
import { type ThreadRow, threadKind } from "../../dal/threads/types.js";
import { stableUuid } from "../workflows/dispatch-published-run.js";

/**
 * The specialist's desk line: a thread a person started that is neither a
 * run (the machine's), a pair room (people read it, nobody chats there), a
 * room (opened as one, with members) nor a DM (one person's private line).
 * What a routine report or a hand-off marker means by "the desk".
 */
export function isConversationThread(thread: ThreadRow): boolean {
  return threadKind(thread) === "desk" && Boolean(thread.created_by_user_id);
}

export interface ResolveSpecialistChatThreadInput {
  /** The specialist whose desk this chat belongs to. */
  agentId: string;
  /**
   * The person the message is for. Owns the conversation when this call has
   * to open the specialist's first one; otherwise only the notification
   * cares who they are.
   */
  ownerUserId: string | null;
  spaceId: string | null;
  store: ThreadStore;
  tenantId: string;
  /** Seed for the conversation this creates when the specialist has none. */
  threadSeed: string;
  /** Title for that conversation. */
  title: string;
}

/**
 * The specialist's newest conversation in this Space — the one its desk
 * opens — created when it has none yet. Null when there is nobody to speak
 * to or nowhere to put it: a tenant-global run with no owner is a real
 * configuration, not an error; it just has no chat.
 */
export async function resolveSpecialistChatThread(
  input: ResolveSpecialistChatThreadInput
): Promise<string | null> {
  const { agentId, ownerUserId, spaceId, store, tenantId } = input;
  if (!(spaceId && agentId)) {
    return null;
  }
  const threads = await store.listThreadsForSpaceAgent({
    agentId,
    spaceId,
    tenantId,
  });
  // Hosted by this specialist, not merely a room it is in: the listing is by
  // membership, and a line meant for Tim's desk must not land inside a group
  // room Tim was just addressed in. Newest first, like the desk.
  const existing = threads
    .filter(
      (thread: ThreadRow) =>
        thread.agent_id === agentId && isConversationThread(thread)
    )
    .toSorted((left, right) =>
      right.updated_at.localeCompare(left.updated_at)
    )[0];
  if (existing) {
    return existing.id;
  }
  // Nobody to open a chat FOR: a continuation deliberately runs without the
  // actor's identity, and the row's author has to be a real user. It can
  // still speak into a conversation that exists (above) — it just cannot
  // start one.
  if (!ownerUserId) {
    return null;
  }
  // First message to a specialist nobody has talked to yet. The alternative
  // is staying silent, which is the bug.
  //
  // The id is stable, so this can land on a row that already exists (the chat
  // was archived, say) — and the RPC replaces metadata wholesale.
  const threadId = stableUuid(input.threadSeed);
  const preserved = await preservedThreadUpsertFields({
    metadata: { source: "routine-report" },
    store,
    tenantId,
    threadId,
  });
  const created = await store.upsertThread({
    agentId,
    createdByUserId: ownerUserId,
    id: threadId,
    ...preserved,
    routeContext: {},
    spaceId,
    status: "idle",
    tenantId,
    title: input.title,
  });
  return created.thread.id;
}
