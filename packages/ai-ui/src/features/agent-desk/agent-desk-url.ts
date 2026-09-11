// The engagement string itself lives in ai-core: the shell builds one when a
// space's Chats row links to a conversation, and it cannot import this package.
export {
  AGENT_DESK_CONVERSATION_PREFIX,
  conversationEngagement,
  threadIdFromEngagement,
} from "@engenty/ai-core/browser";

export function agentDeskHostKey(spaceId: string, agentId: string): string {
  return `agent-desk:${spaceId}:${agentId}`;
}

/**
 * A room's host key — by THREAD, not by host agent: a room and its host's
 * desk are two conversations, and one key would hand the room's artefact
 * pane, thread-context card and draft to the desk (and back).
 */
export function agentRoomHostKey(spaceId: string, threadId: string): string {
  return `agent-room:${spaceId}:${threadId}`;
}
