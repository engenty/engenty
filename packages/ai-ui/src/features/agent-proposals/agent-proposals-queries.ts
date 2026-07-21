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
    mutationFn: (agentId: string) => approveAgentProposal(agentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: agentProposalKeys.records,
      });
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
    },
  });
}
