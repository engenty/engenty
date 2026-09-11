// Shared Approve/Reject review for a pending agent hire or revision.
// Used on the overview card and the coordinator desk waiting lane.

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Badge,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Bot, Check, X } from "lucide-react";
import { useState } from "react";
import {
  type HireSpaceOption,
  listHireSpaces,
} from "../agent-form/hire-spaces";
import type { PendingAgentProposal } from "./agent-proposals-api";
import {
  useApproveAgentProposalMutation,
  useRejectAgentProposalMutation,
} from "./agent-proposals-queries";

function spaceName(
  spaces: HireSpaceOption[],
  spaceId: string | null
): string | null {
  if (!spaceId) {
    return null;
  }
  return spaces.find((space) => space.id === spaceId)?.name ?? spaceId;
}

export function AgentProposalReview({
  proposal,
  spaces,
}: {
  proposal: PendingAgentProposal;
  spaces?: HireSpaceOption[];
}) {
  const { t } = useTranslation("ai-ui");
  const spacesQuery = useQuery({
    enabled: spaces === undefined,
    queryFn: ({ signal }) => listHireSpaces(signal),
    queryKey: ["spaces", "list"],
  });
  const resolvedSpaces = spaces ?? spacesQuery.data ?? [];
  const approve = useApproveAgentProposalMutation();
  const reject = useRejectAgentProposalMutation();
  const [error, setError] = useState<string | null>(null);
  const [pickedSpaceId, setPickedSpaceId] = useState(
    proposal.proposedSpaceId ?? ""
  );
  const busy = approve.isPending || reject.isPending;
  const needsSpace = proposal.kind === "new_agent" && !proposal.proposedSpaceId;
  const intendedName = spaceName(resolvedSpaces, proposal.proposedSpaceId);

  const runApprove = () => {
    if (needsSpace && !pickedSpaceId) {
      setError(t("agentProposals.spaceRequired"));
      return;
    }
    setError(null);
    approve.mutate(
      {
        agentId: proposal.agentId,
        spaceId: pickedSpaceId || proposal.proposedSpaceId,
      },
      {
        onError: (err) => {
          setError(
            err instanceof Error
              ? err.message
              : t("agentProposals.actionFailed")
          );
        },
      }
    );
  };

  return (
    <div className="px-4 py-3">
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
            onClick={() => {
              setError(null);
              reject.mutate(proposal.agentId, {
                onError: (err) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : t("agentProposals.actionFailed")
                  );
                },
              });
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <X aria-hidden className="size-3.5" />
            {t("agentProposals.reject")}
          </Button>
          <Button disabled={busy} onClick={runApprove} size="sm" type="button">
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
      {proposal.kind === "new_agent" && intendedName ? (
        <p className="mt-1 text-muted-foreground text-xs">
          {t("agentProposals.intendedSpace", { name: intendedName })}
        </p>
      ) : null}
      {needsSpace ? (
        <div className="mt-2 grid max-w-sm gap-1">
          <Label htmlFor={`proposal-space-${proposal.agentId}`}>
            {t("agentProposals.pickSpace")}
          </Label>
          <Select
            onValueChange={setPickedSpaceId}
            value={pickedSpaceId || undefined}
          >
            <SelectTrigger id={`proposal-space-${proposal.agentId}`}>
              <SelectValue placeholder={t("agentProposals.pickSpace")} />
            </SelectTrigger>
            <SelectContent>
              {resolvedSpaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  {space.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
    </div>
  );
}
