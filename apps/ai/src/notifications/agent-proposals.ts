// A gated hire or revision is a decision about the agent, not about the chat
// card that happens to show it. The propose route files `agent_proposed`;
// approve/reject resolve it. Interactive runs still suspend a widget — that
// card must not write a second `agent_question` row (`durable_inbox` on the
// artifact in emit-interrupt.ts).

import { emitInboxNotification, resolveNotifications } from "./inbox.js";

export const AGENT_PROPOSAL_SUBJECT = "agent";

export async function notifyAgentProposed(input: {
  agentId: string;
  agentName: string;
  pendingRevision: boolean;
  proposedByAgent: string | null;
  spaceId: string | null;
  tenantId: string;
}): Promise<void> {
  const actor = input.proposedByAgent;
  await emitInboxNotification({
    actor: { id: actor, kind: actor ? "agent" : "system" },
    dedupeKey: `agent-proposal:${input.tenantId}:${input.agentId}`,
    kind: "agent_proposed",
    metadata: {
      agent_id: input.agentId,
      agent_name: input.agentName,
      ...(actor ? { agent_type_key: actor } : {}),
      ...(input.spaceId ? { space_id: input.spaceId } : {}),
    },
    priority: "medium",
    source: "agent-registry",
    spaceId: input.spaceId,
    subject: { id: input.agentId, type: AGENT_PROPOSAL_SUBJECT },
    summary: input.pendingRevision
      ? `${actor ?? "An agent"} proposed a revision to "${input.agentName}" — review and approve to apply it.`
      : `${actor ?? "An agent"} proposed a new agent "${input.agentName}" — review and approve to activate it.`,
    tenantId: input.tenantId,
  });
}

export async function resolveAgentProposalNotifications(input: {
  agentId: string;
  tenantId: string;
}): Promise<void> {
  await resolveNotifications({
    outcome: "decided",
    subjectId: input.agentId,
    subjectType: AGENT_PROPOSAL_SUBJECT,
    tenantId: input.tenantId,
  });
}
