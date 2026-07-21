// Overview section for pending agent proposals (agent-registry governance):
// agents the coordinator proposed (status='proposed') and pending revisions
// to active agents (proposed_config). Approve activates (revisions apply);
// reject deletes the proposal / drops the revision — the live agent is never
// touched. Renders nothing when there is nothing to review.

import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, Card, Skeleton } from "@engenty/ui-core";
import { Bot, Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type PendingAgentProposal,
  selectPendingProposals,
} from "./agent-proposals-api";
import {
  useAgentRecordsQuery,
  useApproveAgentProposalMutation,
  useRejectAgentProposalMutation,
} from "./agent-proposals-queries";

function ProposalRow({ proposal }: { proposal: PendingAgentProposal }) {
  const { t } = useTranslation("ai-ui");
  const approve = useApproveAgentProposalMutation();
  const reject = useRejectAgentProposalMutation();
  const [error, setError] = useState<string | null>(null);
  const busy = approve.isPending || reject.isPending;

  const act = (mutation: typeof approve) => {
    setError(null);
    mutation.mutate(proposal.agentId, {
      onError: (err) => {
        setError(
          err instanceof Error ? err.message : t("agentProposals.actionFailed")
        );
      },
    });
  };

  return (
    <li className="border-border/60 border-t px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <Bot aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium text-sm">
          {proposal.name}
        </span>
        <code className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
          {proposal.agentId}
        </code>
        <Badge
          variant={proposal.kind === "new_agent" ? "default" : "secondary"}
        >
          {proposal.kind === "new_agent"
            ? t("agentProposals.kindNew")
            : t("agentProposals.kindRevision")}
        </Badge>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            disabled={busy}
            onClick={() => act(reject)}
            size="sm"
            type="button"
            variant="outline"
          >
            <X aria-hidden className="size-3.5" />
            {t("agentProposals.reject")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => act(approve)}
            size="sm"
            type="button"
          >
            <Check aria-hidden className="size-3.5" />
            {t("agentProposals.approve")}
          </Button>
        </span>
      </div>
      {proposal.createdByAgent ? (
        <p className="mt-1 text-muted-foreground text-xs">
          {t("agentProposals.proposedBy", { agent: proposal.createdByAgent })}
        </p>
      ) : null}
      {proposal.description ? (
        <p className="mt-1 text-muted-foreground text-sm">
          {proposal.description}
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="cursor-pointer select-none text-muted-foreground text-xs hover:text-foreground">
          {t("agentProposals.showInstructions")}
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/60 p-3 text-xs">
          {proposal.instructions}
        </pre>
        {proposal.toolIds.length > 0 ? (
          <p className="mt-2 text-muted-foreground text-xs">
            {t("agentProposals.tools")}: {proposal.toolIds.join(", ")}
          </p>
        ) : null}
        {proposal.skillIds.length > 0 ? (
          <p className="mt-1 text-muted-foreground text-xs">
            {t("agentProposals.skills")}: {proposal.skillIds.join(", ")}
          </p>
        ) : null}
      </details>
      {error ? <p className="mt-2 text-destructive text-xs">{error}</p> : null}
    </li>
  );
}

export function AgentProposalsCard() {
  const { t } = useTranslation("ai-ui");
  const recordsQuery = useAgentRecordsQuery();
  const pending = useMemo(
    () => selectPendingProposals(recordsQuery.data ?? []),
    [recordsQuery.data]
  );

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
              <ProposalRow
                key={`${proposal.agentId}:${proposal.kind}`}
                proposal={proposal}
              />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
