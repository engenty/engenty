import type { AgentDeskEngagement } from "@engenty/ai-core/browser";
import { cn } from "@engenty/ui-core";
import { CheckCircle2, CircleDot, Clock3, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { AgentProposalReview } from "../agent-proposals/agent-proposal-review.js";
import type { PendingAgentProposal } from "../agent-proposals/agent-proposals-api.js";

const LANE_ICON = {
  active: CircleDot,
  assigned: Clock3,
  completed: CheckCircle2,
  conversation: MessageSquare,
  waiting: Clock3,
} as const;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function proposalFromEngagement(
  engagement: AgentDeskEngagement
): PendingAgentProposal | null {
  const metadata = engagement.metadata;
  const agentId =
    typeof metadata.agent_id === "string" ? metadata.agent_id : null;
  const name = typeof metadata.name === "string" ? metadata.name : null;
  const instructions =
    typeof metadata.instructions === "string" ? metadata.instructions : null;
  if (!(agentId && name && instructions)) {
    return null;
  }
  return {
    agentId,
    createdByAgent:
      typeof metadata.created_by_agent === "string"
        ? metadata.created_by_agent
        : null,
    description:
      typeof metadata.description === "string" ? metadata.description : "",
    instructions,
    kind: metadata.kind === "revision" ? "revision" : "new_agent",
    name,
    proposedSpaceId:
      typeof metadata.proposed_space_id === "string"
        ? metadata.proposed_space_id
        : null,
    skillIds: asStringArray(metadata.skill_ids),
    toolIds: asStringArray(metadata.tool_ids),
    updatedAt: engagement.sort_at,
  };
}

export function AgentDeskEngagementRow({
  engagement,
  isDefault = false,
}: {
  engagement: AgentDeskEngagement;
  isDefault?: boolean;
}) {
  if (engagement.kind === "proposal") {
    const proposal = proposalFromEngagement(engagement);
    if (!proposal) {
      return null;
    }
    return (
      <div
        className={cn(
          engagement.lane === "waiting" && "text-amber-800 dark:text-amber-300"
        )}
      >
        <AgentProposalReview proposal={proposal} />
      </div>
    );
  }

  const Icon = LANE_ICON[engagement.lane];
  return (
    <Link
      aria-current={isDefault ? "true" : undefined}
      className={cn(
        "ui-row-hover flex items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        isDefault && "bg-accent/40",
        engagement.lane === "waiting" && "text-amber-800 dark:text-amber-300"
      )}
      to={engagement.href}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">
          {engagement.title}
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {[engagement.subtitle, engagement.status].filter(Boolean).join(" · ")}
        </span>
      </span>
      <time
        className="shrink-0 text-muted-foreground text-xs"
        dateTime={engagement.sort_at}
      >
        {new Intl.DateTimeFormat(undefined, {
          day: "numeric",
          month: "short",
        }).format(new Date(engagement.sort_at))}
      </time>
    </Link>
  );
}
