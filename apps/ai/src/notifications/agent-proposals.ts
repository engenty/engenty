// A gated hire or revision is a decision about the agent, not about the chat
// card that happens to show it. The propose route files `agent_proposed`;
// approve/reject resolve it. Interactive runs still suspend a widget — that
// card must not write a second `agent_question` row (`durable_inbox` on the
// artifact in emit-interrupt.ts).

import { emitInboxNotification, resolveNotifications } from "./inbox.js";

export const AGENT_PROPOSAL_SUBJECT = "agent";

/**
 * Where a gated hire or revision is decided when it has no space: the Engenty
 * overview's proposals card (Approve / Reject). With a space, the same card
 * sits on the space's Agents page and the row's target is built there.
 */
export const AGENT_PROPOSALS_ROUTE = "/admin/engenty";

/** One open row per proposed agent: a re-propose (or a new look) merges in. */
export function agentProposalDedupeKey(input: {
  agentId: string;
  tenantId: string;
}): string {
  return `agent-proposal:${input.tenantId}:${input.agentId}`;
}

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
    dedupeKey: agentProposalDedupeKey(input),
    kind: "agent_proposed",
    metadata: {
      agent_id: input.agentId,
      agent_name: input.agentName,
      ...(actor ? { agent_type_key: actor } : {}),
      pending_revision: input.pendingRevision,
      ...(input.spaceId ? { space_id: input.spaceId } : {}),
    },
    priority: "medium",
    source: "agent-registry",
    spaceId: input.spaceId,
    subject: { id: input.agentId, type: AGENT_PROPOSAL_SUBJECT },
    // Fallback only (a nameless proposal): the title says it whole otherwise.
    summary: input.pendingRevision
      ? "An agent revision is waiting for review"
      : "A new agent is waiting for review",
    ...(input.spaceId ? {} : { target: AGENT_PROPOSALS_ROUTE }),
    tenantId: input.tenantId,
    title: {
      key: input.pendingRevision ? "agent_revision_proposed" : "agent_proposed",
      params: { name: input.agentName },
    },
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
