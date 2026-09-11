/**
 * How one conversation is named inside an Agent Desk URL.
 *
 * In ai-core rather than in the desk that owns the surface, because two
 * unrelated places have to agree on the string: the desk itself reads it back
 * off `?engagement=`, and the SHELL builds it when a row in a space's Chats
 * list links to a conversation (PLAN-space-chats.md). A shell that cannot
 * import the desk's package would otherwise hand-write the prefix, and a
 * hand-written copy of a wire format is how a link starts opening the right
 * agent on no conversation at all.
 *
 * An engagement is deliberately wider than a thread — the desk's feed also
 * carries tasks and proposals — so the kind is part of the value rather than
 * assumed by the reader.
 */
export const AGENT_DESK_CONVERSATION_PREFIX = "conversation:";

export function conversationEngagement(threadId: string): string {
  return `${AGENT_DESK_CONVERSATION_PREFIX}${threadId}`;
}

/** The thread id inside a `conversation:…` engagement, or null for any other kind. */
export function threadIdFromEngagement(
  engagement: string | null | undefined
): string | null {
  if (!engagement?.startsWith(AGENT_DESK_CONVERSATION_PREFIX)) {
    return null;
  }
  return engagement.slice(AGENT_DESK_CONVERSATION_PREFIX.length) || null;
}
