import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  type AgentDeskMemory,
  getAgentDeskMemory,
  putAgentDeskMemory,
} from "./agent-desk-api.js";

export const agentMemoryKeys = {
  memory: (spaceId: string, agentId: string) =>
    ["agent-desk", "memory", spaceId, agentId] as const,
};

export function useAgentMemoryQuery(input: {
  agentId: string;
  enabled?: boolean;
  spaceId: string;
}) {
  return useQuery({
    enabled: (input.enabled ?? true) && Boolean(input.agentId && input.spaceId),
    queryFn: ({ signal }) =>
      getAgentDeskMemory(
        { agent_id: input.agentId, space_id: input.spaceId },
        signal
      ),
    queryKey: agentMemoryKeys.memory(input.spaceId, input.agentId),
    staleTime: 10_000,
  });
}

export function useSaveAgentMemoryMutation(input: {
  agentId: string;
  spaceId: string;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memory: string) =>
      putAgentDeskMemory({
        agent_id: input.agentId,
        memory,
        space_id: input.spaceId,
      }),
    onSuccess: (result: AgentDeskMemory) => {
      queryClient.setQueryData(
        agentMemoryKeys.memory(input.spaceId, input.agentId),
        result
      );
    },
  });
}
