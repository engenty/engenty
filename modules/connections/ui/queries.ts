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
  getConnectionsUsage,
  listApprovalRequests,
  setConnectionPolicy,
  updateConnectionSettings,
} from "./api.js";

export const connectionsKeys = {
  all: ["connections"] as const,
  catalog: (target?: string | null) =>
    target === undefined
      ? ([...connectionsKeys.all, "catalog"] as const)
      : ([...connectionsKeys.all, "catalog", target ?? "me"] as const),
  approvals: (status: ApprovalStatus) =>
    [...connectionsKeys.all, "approvals", status] as const,
  usage: () => [...connectionsKeys.all, "usage"] as const,
};

/** Accounts per connector across the Organisation — counts only (admin). */
export function useConnectionsUsageQuery(enabled = true) {
  return useQuery({
    enabled,
    queryFn: ({ signal }) => getConnectionsUsage(signal),
    queryKey: connectionsKeys.usage(),
    staleTime: 30_000,
  });
}

/**
 * `target`: that Space's accounts (id), the viewer's own (null); omitted, the
 * current Space's.
 */
export function connectionsCatalogOptions(target?: string | null) {
  return queryOptions({
    queryKey: connectionsKeys.catalog(target),
    queryFn: ({ signal }) => getConnectionsCatalog(signal, target),
  });
}

export function useConnectionsCatalogQuery(target?: string | null) {
  return useQuery(connectionsCatalogOptions(target));
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
    mutationFn: (input: SetConnectionPolicyInput) => setConnectionPolicy(input),
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
