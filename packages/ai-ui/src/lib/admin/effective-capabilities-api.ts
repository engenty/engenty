// The runtime tool and skill set of an agent, by layer — apps/ai
// `GET /ai/registry/agents/:id/effective-capabilities`. The row's stored
// `tool_ids` is one input of four; this is the assembled answer.
import { useQuery } from "@engenty/query-client";
import { requestAiServiceJson } from "../runtime/ai-service-client.js";

export interface AgentEffectiveCapabilities {
  agent_id: string;
  carries_floor: boolean;
  skills: {
    agent: string[];
    default: string[];
    space: string[] | null;
  };
  space_id: string | null;
  tools: {
    agent: string[];
    attached: string[];
    default: string[];
    space_hidden: string[] | null;
  };
  top_level: boolean;
}

export function getAgentEffectiveCapabilities(
  input: { agentId: string; spaceId?: string | null },
  signal?: AbortSignal
): Promise<AgentEffectiveCapabilities> {
  const query = input.spaceId
    ? `?${new URLSearchParams({ space_id: input.spaceId }).toString()}`
    : "";
  return requestAiServiceJson<AgentEffectiveCapabilities>(
    `/ai/registry/agents/${encodeURIComponent(input.agentId)}/effective-capabilities${query}`,
    { signal }
  );
}

export const effectiveCapabilitiesQueryKey = (
  agentId: string,
  spaceId: string | null
) => ["ai", "registry", "effective-capabilities", agentId, spaceId] as const;

export function useAgentEffectiveCapabilitiesQuery(input: {
  agentId: string | null | undefined;
  enabled?: boolean;
  spaceId?: string | null;
}) {
  const agentId = input.agentId ?? "";
  const spaceId = input.spaceId ?? null;
  return useQuery({
    enabled: Boolean(agentId) && input.enabled !== false,
    queryFn: ({ signal }) =>
      getAgentEffectiveCapabilities({ agentId, spaceId }, signal),
    queryKey: effectiveCapabilitiesQueryKey(agentId, spaceId),
    staleTime: 60_000,
  });
}
