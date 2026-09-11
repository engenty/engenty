/**
 * "Which accounts may this agent use?" — PLAN-spaces.md Phase CN.5, Flow D.
 *
 * **From the agent's side, deliberately.** The first sketch put per-agent
 * toggles on each connection card: technically the same rows, and the wrong way
 * round. People hold this question as "what can the Marketing Agent do", not as
 * "which of my eleven agents may touch this mailbox" — and a toggle list on a
 * connection grows with the agent roster, which is the direction that scales
 * badly. The connection card shows the inverse, read-only, as an audit trail.
 *
 * **What a grant means.** Only that the agent may REACH the account in
 * unattended runs. Everything else still applies: `autonomous_mode`, the
 * per-action policies, the space it is mounted in. Granting is not approving.
 *
 * Only the account's OWNER may grant it, enforced server-side
 * (`assertOwnerOrThrow`). The picker therefore shows what the current user can
 * lend out — their own accounts and the org's — never a colleague's mailbox.
 */

import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
} from "@engenty/ui-core";
import { Cable, Plus, X } from "lucide-react";
import { useMemo } from "react";

interface CatalogConnection {
  display_name: string | null;
  external_account: string | null;
  id: string;
  owner_user_id: string | null;
  sharing: "org" | "personal";
}

interface CatalogConnector {
  connections: CatalogConnection[];
  id: string;
  name: string;
}

interface AgentGrant {
  agent_id: string;
  connection_id: string;
}

const CATALOG_KEY = ["ai-ui", "agent-connections", "catalog"] as const;
const grantsKey = (agentId: string) =>
  ["ai-ui", "agent-connections", "grants", agentId] as const;

/** The account as a person recognises it, falling back to the connector. */
function accountLabel(
  connection: CatalogConnection,
  connectorName: string
): string {
  return (
    connection.display_name?.trim() ||
    connection.external_account?.trim() ||
    connectorName
  );
}

export function AgentConnectionsPanel({ agentId }: { agentId: string }) {
  const { t } = useTranslation("ai-ui");
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({
    queryFn: () =>
      requestApiJson<{ connectors: CatalogConnector[] }>(
        "/api/tools/connections_catalog/invoke",
        { body: { input: {} }, method: "POST" }
      ),
    queryKey: CATALOG_KEY,
    staleTime: 30_000,
  });

  const grantsQuery = useQuery({
    queryFn: () =>
      requestApiJson<{ grants: AgentGrant[] }>(
        "/api/tools/connections_agent_grants_list/invoke",
        { body: { input: { agent_id: agentId } }, method: "POST" }
      ),
    queryKey: grantsKey(agentId),
  });

  const setGrant = useMutation({
    mutationFn: (params: { connectionId: string; granted: boolean }) =>
      requestApiJson<{ granted: boolean }>(
        "/api/tools/connections_agent_grant_set/invoke",
        {
          body: {
            input: {
              agent_id: agentId,
              connection_id: params.connectionId,
              granted: params.granted,
            },
          },
          method: "POST",
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: grantsKey(agentId) });
    },
  });

  /** Every account the caller may lend out, flattened with its connector. */
  const accounts = useMemo(() => {
    const list: Array<{
      connection: CatalogConnection;
      connectorName: string;
      label: string;
    }> = [];
    for (const connector of catalogQuery.data?.connectors ?? []) {
      for (const connection of connector.connections ?? []) {
        list.push({
          connection,
          connectorName: connector.name,
          label: accountLabel(connection, connector.name),
        });
      }
    }
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogQuery.data]);

  const grantedIds = useMemo(
    () => new Set((grantsQuery.data?.grants ?? []).map((g) => g.connection_id)),
    [grantsQuery.data]
  );

  const granted = accounts.filter((row) => grantedIds.has(row.connection.id));
  const available = accounts.filter(
    (row) => !grantedIds.has(row.connection.id)
  );

  if (catalogQuery.isPending || grantsQuery.isPending) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {/* The failure is shown in place rather than as a toast: ai-ui has no
          toaster, and a permission change that silently did not happen is the
          worst outcome here. */}
      {setGrant.isError ? (
        <p className="px-3 py-2 text-destructive text-xs">
          {t("agentConnections.saveFailed")}
        </p>
      ) : null}
      {granted.length === 0 ? (
        <p className="px-3 py-4 text-center text-muted-foreground text-sm">
          {t("agentConnections.empty")}
        </p>
      ) : (
        granted.map((row) => (
          <div
            className="flex items-center gap-3 px-3 py-2"
            key={row.connection.id}
          >
            <Cable
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground text-sm">
                {row.label}
              </span>
              <span className="truncate text-muted-foreground text-xs">
                {row.connectorName}
              </span>
            </div>
            {row.connection.sharing === "personal" ? (
              <Badge variant="secondary">
                {t("agentConnections.personalBadge")}
              </Badge>
            ) : null}
            <Button
              aria-label={t("agentConnections.revoke")}
              disabled={setGrant.isPending}
              onClick={() =>
                setGrant.mutate({
                  connectionId: row.connection.id,
                  granted: false,
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex w-full items-center justify-center gap-2 px-3 py-2 font-semibold text-primary text-xs transition-colors hover:bg-primary/5 disabled:opacity-50"
            disabled={available.length === 0 || setGrant.isPending}
            type="button"
          >
            <Plus className="size-3" />
            {t("agentConnections.grantAction")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {available.map((row) => (
            <DropdownMenuItem
              key={row.connection.id}
              onSelect={() =>
                setGrant.mutate({
                  connectionId: row.connection.id,
                  granted: true,
                })
              }
            >
              <span className="truncate">{row.label}</span>
              <span className="ml-2 text-muted-foreground text-xs">
                {row.connectorName}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
