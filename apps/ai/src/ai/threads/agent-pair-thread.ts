// Where two agents of a Space talk: one thread per pair, kept for good.
//
// Every `message_agent` between the same two agents — either direction, ask
// or notify — lands in this thread, so the colleague answers with everything
// the pair has said before, and a follow-up finds the earlier turn. The
// colleague addressed first hosts it; the other is a member (`thread_agent`).
// People can open it from either desk and read it, never post into it
// (`delegated`). The desks themselves only get a marker pointing here: the
// human conversation stays the human's.
import type { ThreadStore } from "../../dal/threads/thread-store.js";
import { preservedThreadUpsertFields } from "../../dal/threads/thread-upsert-preserve.js";
import { stableUuid } from "../workflows/dispatch-published-run.js";

function sortedPair(a: string, b: string): [string, string] {
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

export function agentPairThreadId(input: {
  agentA: string;
  agentB: string;
  spaceId: string;
}): string {
  const [first, second] = sortedPair(input.agentA, input.agentB);
  return stableUuid(`agent-pair:${input.spaceId}:${first}:${second}`);
}

export interface ResolveAgentPairThreadInput {
  /** The agent being addressed — the desk the thread is listed on. */
  colleagueId: string;
  colleagueName: string;
  /** The person on whose behalf the sender runs; the row's owner. */
  ownerUserId: string | null;
  senderId: string;
  senderName: string;
  spaceId: string;
  store: ThreadStore;
  tenantId: string;
}

/**
 * The pair's thread, created on first contact. The row belongs to the
 * colleague addressed first (the desk feed lists by agent), is read-only for
 * people (`delegated`), and names both agents in `agent_pair` so either side
 * can find it.
 */
export async function resolveAgentPairThread(
  input: ResolveAgentPairThreadInput
): Promise<{ agentId: string; id: string }> {
  const { store, tenantId } = input;
  const threadId = agentPairThreadId({
    agentA: input.senderId,
    agentB: input.colleagueId,
    spaceId: input.spaceId,
  });
  const existing = await store.getThread({ tenantId, threadId });
  if (existing && !existing.archived_at) {
    // The row keeps the desk it was first listed on, whichever side is
    // messaging now — that desk is where its answers read right.
    return { agentId: existing.agent_id, id: existing.id };
  }
  // The id is stable, so this may land on an archived row — and the RPC
  // replaces metadata wholesale, hence the preserved fields.
  const preserved = await preservedThreadUpsertFields({
    metadata: { source: "agent-message" },
    store,
    tenantId,
    threadId,
  });
  const created = await store.upsertThread({
    agentId: input.colleagueId,
    createdByUserId: input.ownerUserId,
    id: threadId,
    ...preserved,
    routeContext: { delegated: true },
    spaceId: input.spaceId,
    status: "idle",
    tenantId,
    title: `${input.senderName} ⇄ ${input.colleagueName}`,
  });
  // The upsert wrote the host row; the sender is the other member.
  await store.addAgentMember({
    agentId: input.senderId,
    tenantId,
    threadId: created.thread.id,
  });
  return { agentId: input.colleagueId, id: created.thread.id };
}

/**
 * Message metadata on a desk-room row that only points at a pair thread: the
 * "Message from …" line a person sees in the room, with the exchange itself
 * one click away. The row's text carries the sender header and a preview, so
 * the desk's agent also knows the message happened.
 */
export const AGENT_MESSAGE_MARKER_KEY = "engenty_agent_message";

export interface AgentMessageMarker {
  /** The colleague whose message this points at. */
  agent_id: string;
  /**
   * For a `reply`: artifacts the desk agent wrote or presented while
   * answering, so the desk offers the deliverable beside the quote instead of
   * leaving it in the pair thread.
   */
  artifact_ids?: string[];
  /**
   * What the row is: the brief a colleague sent (`message`, the default — a
   * user row carrying the sender header) or the desk agent's own reply to
   * it, cut to a preview (`reply`, an assistant row). The desk draws the
   * reply as a quote with a way into the pair thread.
   */
  kind?: "message" | "reply";
  /** For a `reply`: who the desk agent answered. */
  reply_to_agent_id?: string;
  /** The agent whose desk lists the pair thread — where it opens. */
  thread_agent_id: string;
  /** The pair thread the message lives in. */
  thread_id: string;
}
