import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  type AgentDeskTasks,
  getAgentDeskTasks,
  putAgentDeskTasks,
} from "./agent-desk-api.js";

export const agentTasksKeys = {
  tasks: (spaceId: string, agentId: string) =>
    ["agent-desk", "tasks", spaceId, agentId] as const,
};

export function useAgentTasksQuery(input: {
  agentId: string;
  enabled?: boolean;
  spaceId: string;
}) {
  return useQuery({
    enabled: (input.enabled ?? true) && Boolean(input.agentId && input.spaceId),
    queryFn: ({ signal }) =>
      getAgentDeskTasks(
        { agent_id: input.agentId, space_id: input.spaceId },
        signal
      ),
    queryKey: agentTasksKeys.tasks(input.spaceId, input.agentId),
    staleTime: 10_000,
  });
}

export function useSaveAgentTasksMutation(input: {
  agentId: string;
  spaceId: string;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tasks: string) =>
      putAgentDeskTasks({
        agent_id: input.agentId,
        space_id: input.spaceId,
        tasks,
      }),
    onSuccess: (result: AgentDeskTasks) => {
      queryClient.setQueryData(
        agentTasksKeys.tasks(input.spaceId, input.agentId),
        result
      );
    },
  });
}
