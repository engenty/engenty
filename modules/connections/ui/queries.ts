import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type {
  ApprovalStatus,
  DecideApprovalInput,
  SetConnectionPolicyInput,
  UpdateConnectionSettingsInput,
} from "./api.js";
import {
  decideApprovalRequest,
  disconnectConnection,
  getConnectionsCatalog,
  listApprovalRequests,
  setConnectionPolicy,
  updateConnectionSettings,
} from "./api.js";

export const connectionsKeys = {
  all: ["connections"] as const,
  catalog: () => [...connectionsKeys.all, "catalog"] as const,
  approvals: (status: ApprovalStatus) =>
    [...connectionsKeys.all, "approvals", status] as const,
};

export function connectionsCatalogOptions() {
  return queryOptions({
    queryKey: connectionsKeys.catalog(),
    queryFn: ({ signal }) => getConnectionsCatalog(signal),
  });
}

export function useConnectionsCatalogQuery() {
  return useQuery(connectionsCatalogOptions());
}

export function connectionApprovalsOptions(status: ApprovalStatus = "pending") {
  return queryOptions({
    queryKey: connectionsKeys.approvals(status),
    queryFn: async ({ signal }) => {
      const { requests } = await listApprovalRequests(status, signal);
      return requests;
    },
  });
}

export function useConnectionApprovalsQuery(
  status: ApprovalStatus = "pending"
) {
  return useQuery(connectionApprovalsOptions(status));
}

/**
 * Pending-approvals count for the admin app-bar badge. Called by the shell
 * from an always-mounted component, so it polls conservatively.
 */
export function usePendingConnectionApprovalsBadgeCount(): number | undefined {
  const { data } = useQuery({
    ...connectionApprovalsOptions("pending"),
    refetchInterval: 60_000,
  });
  const count = data?.length ?? 0;
  return count > 0 ? count : undefined;
}

export function useUpdateConnectionSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateConnectionSettingsInput) =>
      updateConnectionSettings(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: connectionsKeys.catalog(),
      });
    },
  });
}

export function useSetConnectionPolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetConnectionPolicyInput) =>
      setConnectionPolicy(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: connectionsKeys.catalog(),
      });
    },
  });
}

export function useDisconnectConnectionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => disconnectConnection(connectionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: connectionsKeys.catalog(),
      });
    },
  });
}

export function useDecideApprovalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DecideApprovalInput) => decideApprovalRequest(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: connectionsKeys.all,
      });
    },
  });
}
