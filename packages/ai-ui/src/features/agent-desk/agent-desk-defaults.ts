import type {
  AgentDeskAgent,
  AgentDeskEngagement,
} from "@engenty/ai-core/browser";

export type AgentDeskDefault =
  | { engagement: AgentDeskEngagement | null; kind: "desk" }
  | { engagement: AgentDeskEngagement | null; kind: "conversation" };

/** Anyone you can ask opens as a durable chat. */
export function isAgentDeskChatSurface(
  agent: Pick<AgentDeskAgent, "can_ask">
): boolean {
  return agent.can_ask;
}

/**
 * Not the desk line. A routine fire writes a thread of its own, and the desk
 * lists it — it is this agent's work — but it is NOT somewhere a person was
 * talking, so it can never be the chat you land on: leaving a tab drops the
 * open conversation from the URL on purpose, and before routines had threads
 * "the newest thread" always meant "the newest chat". A colleague's delegated
 * thread is the same. A room (opened as one, with members) and a DM (one
 * person's private line) are conversations, but the sidebar lists those and
 * opens them by name; the desk's own line is the one without either marker.
 */
function isNotTheDeskLine(engagement: AgentDeskEngagement): boolean {
  // `desk_line` is the server's own answer (`isConversationThread`): a thread
  // a person started. The per-kind flags below it are the older reading, kept
  // for a feed that predates the field.
  if (engagement.metadata.desk_line === false) {
    return true;
  }
  return (
    typeof engagement.metadata.routine_id === "string" ||
    engagement.metadata.delegated === true ||
    engagement.metadata.room === true ||
    engagement.metadata.dm === true
  );
}

export function resolveAgentDeskDefault(input: {
  agent: AgentDeskAgent;
  engagements: AgentDeskEngagement[];
}): AgentDeskDefault {
  const latestConversation =
    input.engagements
      .filter(
        (engagement) =>
          engagement.kind === "conversation" && !isNotTheDeskLine(engagement)
      )
      .toSorted(
        (left, right) =>
          right.sort_at.localeCompare(left.sort_at) ||
          left.id.localeCompare(right.id)
      )[0] ?? null;
  if (isAgentDeskChatSurface(input.agent)) {
    return { engagement: latestConversation, kind: "conversation" };
  }
  return {
    engagement: input.engagements[0] ?? null,
    kind: "desk",
  };
}

export function canManageAgent(
  agent: Pick<AgentDeskAgent, "managed_by_module" | "source">
): boolean {
  return agent.source === "database" && agent.managed_by_module === null;
}
