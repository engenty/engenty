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
  catalog: (spaceId?: string | null) =>
    spaceId
      ? ([...connectionsKeys.all, "catalog", spaceId] as const)
      : ([...connectionsKeys.all, "catalog"] as const),
  approvals: (status: ApprovalStatus) =>
    [...connectionsKeys.all, "approvals", status] as const,
};

/** `spaceId`: that Space's accounts; omitted, the current Space's. */
export function connectionsCatalogOptions(spaceId?: string | null) {
  return queryOptions({
    queryKey: connectionsKeys.catalog(spaceId),
    queryFn: ({ signal }) => getConnectionsCatalog(signal, spaceId),
  });
}

export function useConnectionsCatalogQuery(spaceId?: string | null) {
  return useQuery(connectionsCatalogOptions(spaceId));
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
