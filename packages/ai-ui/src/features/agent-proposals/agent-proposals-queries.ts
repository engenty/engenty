import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  approveAgentProposal,
  listAgentRecords,
  rejectAgentProposal,
} from "./agent-proposals-api.js";

export const agentProposalKeys = {
  records: ["agent-registry", "records"] as const,
};

export function useAgentRecordsQuery() {
  return useQuery({
    queryKey: agentProposalKeys.records,
    queryFn: ({ signal }) => listAgentRecords(signal),
    retry: false,
    staleTime: 30_000,
  });
}

export function useApproveAgentProposalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { agentId: string; spaceId?: string | null }) =>
      approveAgentProposal(input.agentId, input.spaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: agentProposalKeys.records,
      });
      void queryClient.invalidateQueries({ queryKey: ["agent-desk"] });
    },
  });
}

export function useRejectAgentProposalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => rejectAgentProposal(agentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: agentProposalKeys.records,
      });
      void queryClient.invalidateQueries({ queryKey: ["agent-desk"] });
    },
  });
}
