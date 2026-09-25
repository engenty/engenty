// Skills an agent drafted and a person has not reviewed yet (memory Phase
// 4b). Approve copies the draft into the tenant's custom skills; reject drops
// it. The bell's `skill_proposed` row points here — this is where it is
// decided. Renders nothing when nothing waits.

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Button, Card, Skeleton } from "@engenty/ui-core";
import { Check, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export interface SkillProposal {
  description: string;
  name: string;
  proposed_by: string | null;
}

const skillProposalKeys = {
  list: ["ai", "skills", "proposals"] as const,
};

function listSkillProposals(signal?: AbortSignal) {
  return requestAiServiceJson<{ proposals: SkillProposal[] }>(
    "/ai/skills/proposals",
    { signal }
  );
}

function decideSkillProposal(name: string, decision: "approve" | "reject") {
  return requestAiServiceJson<unknown>(
    `/ai/skills/proposals/${encodeURIComponent(name)}/${decision}`,
    { method: "POST" }
  );
}

function SkillProposalRow({ proposal }: { proposal: SkillProposal }) {
  const { t } = useTranslation("ai-ui");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      decideSkillProposal(proposal.name, decision),
    onError: (err) =>
      setError(
        err instanceof Error ? err.message : t("skillProposals.actionFailed")
      ),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: skillProposalKeys.list });
      void queryClient.invalidateQueries({ queryKey: ["ai", "skills"] });
    },
  });
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 truncate font-medium text-sm">
          {proposal.name}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            disabled={decide.isPending}
            onClick={() => decide.mutate("reject")}
            size="sm"
            type="button"
            variant="outline"
          >
            <X aria-hidden className="mr-1 size-3.5" />
            {t("skillProposals.reject")}
          </Button>
          <Button
            disabled={decide.isPending}
            onClick={() => decide.mutate("approve")}
            size="sm"
            type="button"
          >
            <Check aria-hidden className="mr-1 size-3.5" />
            {t("skillProposals.approve")}
          </Button>
        </span>
      </div>
      {proposal.description ? (
        <p className="mt-1 text-muted-foreground text-sm">
          {proposal.description}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function SkillProposalsCard() {
  const { t } = useTranslation("ai-ui");
  const query = useQuery({
    queryFn: ({ signal }) => listSkillProposals(signal),
    queryKey: skillProposalKeys.list,
    retry: false,
    staleTime: 30_000,
  });
  const proposals = query.data?.proposals ?? [];
  if (!query.isLoading && proposals.length === 0) {
    return null;
  }
  return (
    <section aria-label={t("skillProposals.title")} className="pb-4">
      <h2 className="pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t("skillProposals.title")}
      </h2>
      <Card className="p-0" variant="form">
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-2/3 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {proposals.map((proposal) => (
              <li
                className="border-border-soft border-t first:border-t-0"
                key={proposal.name}
              >
                <SkillProposalRow proposal={proposal} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
