import type { QueueServiceLike } from "@engenty/plugin-sdk";
import type { MentionRecord } from "../schema/types.js";

/**
 * Queue contract with the apps/ai mention consumer (name inlined there, same
 * pattern as `agent_task_dispatch`): an agent mention in a channel message
 * becomes one dispatch per mentioned agent.
 */
export const TEAM_CHAT_AGENT_MENTION_QUEUE = "team_chat_agent_mention";

export interface AgentMentionDispatch {
  agent_type_key: string;
  conversation_id: string;
  message_ts: string;
  tenant_id: string;
  /** Root ts of the thread the reply belongs to (= message ts for root posts). */
  thread_ts: string;
}

export async function enqueueAgentMentions(
  queue: QueueServiceLike | null,
  input: {
    conversationId: string;
    mentions: MentionRecord[];
    messageTs: string;
    tenantId: string;
    threadTs: string | null;
  }
): Promise<void> {
  if (!queue) {
    return;
  }
  const agents = [
    ...new Set(
      input.mentions
        .filter((mention) => mention.kind === "agent" && mention.target_id)
        .map((mention) => mention.target_id as string)
    ),
  ];
  for (const agentTypeKey of agents) {
    await queue.send(TEAM_CHAT_AGENT_MENTION_QUEUE, {
      agent_type_key: agentTypeKey,
      conversation_id: input.conversationId,
      message_ts: input.messageTs,
      tenant_id: input.tenantId,
      thread_ts: input.threadTs ?? input.messageTs,
    } satisfies AgentMentionDispatch);
  }
}
