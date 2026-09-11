/**
 * Opening a conversation from OUTSIDE it — a card on the home, a notice.
 *
 * A room or a DM is its own conversation and its path is enough. A specialist
 * desk is not: it renders a chat only when one is bound, so the URL has to say
 * WHICH — `engagement` for a thread that exists, `action=ask` for the first
 * message ever (agent-desk.tsx `chatIsConversation`). Landing on a desk
 * without either shows the desk's overview and swallows whatever sent you
 * there.
 */
import { conversationEngagement } from "@engenty/ai-core/browser";

export function spaceConversationSearch(params: {
  kind: "desk" | "dm" | "room";
  threadId: string | null;
}): string {
  if (params.kind !== "desk") {
    return "";
  }
  return params.threadId
    ? `?engagement=${encodeURIComponent(conversationEngagement(params.threadId))}`
    : "?action=ask";
}
