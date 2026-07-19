import {
  appsAiRequestHeaders,
  resolveEngentyAiServiceBaseUrl,
} from "@engenty/ai-ui/embed";
import { queryOptions, useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import type { MentionCandidate } from "../components/composer.js";
import { teamChatKeys, useTenantUsersQuery } from "../queries.js";

/** Service principals aren't mentionable people. */
export function isServiceIdentity(email: string | null | undefined): boolean {
  return (email ?? "").endsWith("@engenty.local");
}

interface RegistryAgentSummary {
  description?: string | null;
  id: string;
  name?: string | null;
}

async function listRegistryAgents(
  signal?: AbortSignal
): Promise<RegistryAgentSummary[]> {
  const base = resolveEngentyAiServiceBaseUrl();
  // Same-origin fallback covers dev setups where the configured AI origin is
  // not reachable from the current one (vite proxies /ai either way).
  const urls = [
    ...(base ? [`${base.replace(/\/$/, "")}/ai/registry/agents`] : []),
    "/ai/registry/agents",
  ];
  const headers = await appsAiRequestHeaders();
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers,
        ...(signal ? { signal } : {}),
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          agents?: RegistryAgentSummary[];
        };
        return payload.agents ?? [];
      }
    } catch {
      // try the next candidate URL
    }
  }
  return [];
}

export function useAgentCandidatesQuery() {
  return useQuery(
    queryOptions({
      queryFn: ({ signal }) => listRegistryAgents(signal),
      queryKey: [...teamChatKeys.all, "agents"],
      staleTime: 5 * 60 * 1000,
    })
  );
}

/**
 * Composer @-mention candidates: tenant users, registered agents, and
 * here/channel broadcasts. Mentioning an agent dispatches an agent reply
 * into the thread (§7.3).
 */
export function useMentionCandidates(): MentionCandidate[] {
  const usersQuery = useTenantUsersQuery();
  const agentsQuery = useAgentCandidatesQuery();
  return useMemo(() => {
    const users = (usersQuery.data ?? []).filter(
      (user) => !isServiceIdentity(user.email)
    );
    const agents = agentsQuery.data ?? [];
    return [
      ...users.map<MentionCandidate>((user) => ({
        id: user.id,
        insert: `<@u:${user.id}>`,
        kind: "user",
        label: user.display_name || user.email || user.id,
        ...(user.email ? { sublabel: user.email } : {}),
      })),
      ...agents.map<MentionCandidate>((agent) => ({
        id: `agent:${agent.id}`,
        insert: `<@agent:${agent.id}>`,
        kind: "agent",
        label: agent.name || agent.id,
        sublabel: agent.id,
      })),
      { id: "here", insert: "<!here>", kind: "broadcast", label: "@here" },
      {
        id: "channel",
        insert: "<!channel>",
        kind: "broadcast",
        label: "@channel",
      },
    ];
  }, [usersQuery.data, agentsQuery.data]);
}
