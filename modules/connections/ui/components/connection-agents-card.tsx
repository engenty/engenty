/**
 * "Used by" — which agents may act on this account (PLAN-spaces.md CN.5).
 *
 * READ-ONLY on purpose, with a revoke. Granting happens on the AGENT
 * (ai-ui's Capabilities tab), because that is where the question lives: people
 * ask "what can the Marketing Agent do", not "which of my agents may touch this
 * mailbox". What belongs here is the inverse — the owner's audit view of where
 * their account has been lent out, and one place to take it back.
 *
 * Nothing renders when nobody has been granted anything, which is the default:
 * an empty card explaining a feature the user has not used is noise on a page
 * that is already dense.
 */

import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Badge, Button } from "@engenty/ui-core";
import { Bot } from "lucide-react";
import { toast } from "sonner";

interface AgentGrantRow {
  agent_id: string;
  connection_id: string;
  created_at: string;
}

interface AgentSummary {
  id: string;
  name?: string;
}

const GRANTS_KEY = ["connections", "agent-grants"] as const;

export function ConnectionAgentsCard({
  connectionId,
  editable,
}: {
  connectionId: string;
  editable: boolean;
}) {
  const { t } = useTranslation("connections");
  const queryClient = useQueryClient();

  const grantsQuery = useQuery({
    queryFn: () =>
      requestApiJson<{ grants: AgentGrantRow[] }>(
        "/api/tools/connections_agent_grants_list/invoke",
        { body: { input: {} }, method: "POST" }
      ),
    queryKey: GRANTS_KEY,
  });

  // Names only — the grant itself is keyed by id, so a failed lookup degrades
  // to showing the id rather than hiding the grant.
  const agentsQuery = useQuery({
    queryFn: () =>
      requestApiJson<{ agents: AgentSummary[] }>("/ai/registry/agents", {
        method: "GET",
      }).catch(() => ({ agents: [] as AgentSummary[] })),
    queryKey: ["connections", "agent-names"],
    staleTime: 60_000,
  });

  const revoke = useMutation({
    mutationFn: (agentId: string) =>
      requestApiJson<{ granted: boolean }>(
        "/api/tools/connections_agent_grant_set/invoke",
        {
          body: {
            input: {
              agent_id: agentId,
              connection_id: connectionId,
              granted: false,
            },
          },
          method: "POST",
        }
      ),
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : t("agentAccess.revokeFailed")
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRANTS_KEY });
    },
  });

  const rows = (grantsQuery.data?.grants ?? []).filter(
    (grant) => grant.connection_id === connectionId
  );
  if (rows.length === 0) {
    return null;
  }
  const nameOf = (agentId: string) =>
    agentsQuery.data?.agents.find((agent) => agent.id === agentId)?.name ??
    agentId;

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <h4 className="font-medium text-sm">{t("agentAccess.title")}</h4>
        <p className="text-muted-foreground text-xs">
          {t("agentAccess.description")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {rows.map((grant) => (
          <Badge
            className="gap-1.5 py-1"
            key={grant.agent_id}
            variant="outline"
          >
            <Bot aria-hidden className="size-3" />
            {nameOf(grant.agent_id)}
            {editable ? (
              <Button
                aria-label={t("agentAccess.revoke")}
                className="-mr-1 size-4 p-0"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(grant.agent_id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                ×
              </Button>
            ) : null}
          </Badge>
        ))}
      </div>
    </div>
  );
}
