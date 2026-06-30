import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { queryOptions, useQuery } from "@engenty/query-client";

export interface TeamAgentCatalogRow {
  agent_origin?: "custom" | "registry";
  description?: string | null;
  id: string;
  module_id?: string;
  name: string;
  role?: string | null;
  skills: string[];
  tools?: string[];
}

interface RegistryAgentsResponse {
  agents: Array<{
    agent_origin?: "custom" | "registry";
    description?: string | null;
    id: string;
    module_id?: string;
    name: string;
    role?: string | null;
    skills?: string[];
    tools?: string[];
  }>;
}

export const teamAgentsCatalogQueryKey = ["team", "agents", "catalog"] as const;

function resolveAiServiceBaseUrl(): string | null {
  const raw = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_ENGENTY_AI_BASE_URL;
  const normalized = (raw ?? "").trim().replace(/\/$/, "");
  return normalized.length > 0 ? normalized : null;
}

async function fetchTeamAgentsCatalog(
  signal?: AbortSignal
): Promise<TeamAgentCatalogRow[]> {
  const baseUrl = resolveAiServiceBaseUrl();
  if (!baseUrl) {
    return [];
  }
  const response = await requestApiJson<RegistryAgentsResponse>(
    "/ai/registry/agents",
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      signal,
    }
  );
  return (response.agents ?? []).map((agent) => ({
    agent_origin: agent.agent_origin,
    description: agent.description ?? null,
    id: agent.id,
    module_id: agent.module_id,
    name: agent.name?.trim() || agent.id,
    role: agent.role ?? null,
    skills: agent.skills ?? [],
    tools: agent.tools ?? [],
  }));
}

export function teamAgentsCatalogQueryOptions() {
  return queryOptions({
    queryKey: teamAgentsCatalogQueryKey,
    queryFn: ({ signal }) => fetchTeamAgentsCatalog(signal),
    enabled: Boolean(resolveAiServiceBaseUrl()),
    staleTime: 60_000,
    retry: false,
  });
}

export function useTeamAgentsCatalogQuery() {
  const query = useQuery(teamAgentsCatalogQueryOptions());
  return {
    ...query,
    agents: query.data ?? [],
    catalogAvailable: Boolean(resolveAiServiceBaseUrl()),
  };
}
