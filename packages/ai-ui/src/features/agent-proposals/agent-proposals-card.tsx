// Overview section for pending agent proposals (agent-registry governance):
// agents the coordinator proposed (status='proposed') and pending revisions
// to active agents (proposed_config). Approve activates (revisions apply);
// reject deletes the proposal / drops the revision — the live agent is never
// touched. Renders nothing when there is nothing to review.

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Card, Skeleton } from "@engenty/ui-core";
import { useMemo } from "react";
import { listHireSpaces } from "../agent-form/hire-spaces";
import { AgentProposalReview } from "./agent-proposal-review";
import { selectPendingProposals } from "./agent-proposals-api";
import { useAgentRecordsQuery } from "./agent-proposals-queries";

export function AgentProposalsCard({
  spaceId,
}: {
  /** When set, only new hires for this space (or unstamped) are shown. */
  spaceId?: string;
} = {}) {
  const { t } = useTranslation("ai-ui");
  const recordsQuery = useAgentRecordsQuery();
  const spacesQuery = useQuery({
    queryFn: ({ signal }) => listHireSpaces(signal),
    queryKey: ["spaces", "list"],
  });
  const pending = useMemo(() => {
    const all = selectPendingProposals(recordsQuery.data ?? []);
    if (!spaceId) {
      return all;
    }
    return all.filter((proposal) => {
      if (proposal.kind !== "new_agent") {
        return false;
      }
      return (
        proposal.proposedSpaceId === spaceId ||
        proposal.proposedSpaceId === null
      );
    });
  }, [recordsQuery.data, spaceId]);

  // Quiet by default: the overview only surfaces this section when there is
  // actually something to review (inbox notifications announce new proposals).
  if (!recordsQuery.isLoading && pending.length === 0) {
    return null;
  }

  return (
    <section aria-label={t("agentProposals.title")}>
      <h2 className="pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t("agentProposals.title")}
      </h2>
      <Card className="p-0" variant="form">
        {recordsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-2/3 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {pending.map((proposal) => (
              <li
                className="border-border-soft border-t first:border-t-0"
                key={`${proposal.agentId}:${proposal.kind}`}
              >
                <AgentProposalReview
                  proposal={proposal}
                  spaces={spacesQuery.data ?? []}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
