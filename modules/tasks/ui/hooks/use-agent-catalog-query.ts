import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { queryOptions, useQuery } from "@engenty/query-client";

export interface AgentCatalogRow {
  agent_type_key: string;
  label: string;
}

interface RegistryAgentsResponse {
  agents: Array<{
    id: string;
    name: string;
  }>;
}

export const agentCatalogQueryKey = ["tasks", "agents", "catalog"] as const;

function resolveAiServiceBaseUrl(): string | null {
  const raw = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_ENGENTY_AI_BASE_URL;
  const normalized = (raw ?? "").trim().replace(/\/$/, "");
  return normalized.length > 0 ? normalized : null;
}

async function fetchAgentCatalog(
  signal?: AbortSignal
): Promise<AgentCatalogRow[]> {
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
  return (response.agents ?? [])
    .map((agent) => ({
      agent_type_key: agent.id,
      label: agent.name?.trim() || agent.id,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function agentCatalogQueryOptions() {
  return queryOptions({
    queryKey: agentCatalogQueryKey,
    queryFn: ({ signal }) => fetchAgentCatalog(signal),
    enabled: Boolean(resolveAiServiceBaseUrl()),
    staleTime: 60_000,
    retry: false,
  });
}

export function useAgentCatalogQuery() {
  const query = useQuery(agentCatalogQueryOptions());
  return {
    ...query,
    agents: query.data ?? [],
    catalogAvailable: !query.isError,
  };
}
