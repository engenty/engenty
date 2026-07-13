import { requestApiJson } from "@engenty/api-client";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type { ImportConnectorInput, ImportedConnectorStatus } from "./api.js";
import {
  deleteImportedConnector,
  importConnector,
  listImportedConnectors,
  refreshImportedConnector,
  setImportedConnectorStatus,
} from "./api.js";

export const externalConnectorsKeys = {
  all: ["external-connectors"] as const,
  list: () => [...externalConnectorsKeys.all, "list"] as const,
};

export function importedConnectorsOptions() {
  return queryOptions({
    queryKey: externalConnectorsKeys.list(),
    queryFn: async ({ signal }) => {
      const { connectors } = await listImportedConnectors(signal);
      return connectors;
    },
  });
}

export function useImportedConnectorsQuery(enabled = true) {
  return useQuery({ ...importedConnectorsOptions(), enabled });
}

/**
 * Client-side superadmin gate, mirroring the search-index console: the shell's
 * workspace-context query (`/api/users/setup/context`) carries `isSuperAdmin`.
 * Same query key + options as the app shell so the cached response is shared.
 * The server enforces the real gate (403) on every route regardless.
 */
export function useWorkspaceSuperadminQuery() {
  return useQuery({
    queryKey: ["workspace-context"],
    queryFn: ({ signal }) =>
      requestApiJson<{ isSuperAdmin?: boolean }>("/api/users/setup/context", {
        signal,
      }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useImportConnectorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportConnectorInput) => importConnector(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: externalConnectorsKeys.list(),
      });
    },
  });
}

export function useRefreshConnectorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => refreshImportedConnector(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: externalConnectorsKeys.list(),
      });
    },
  });
}

export function useSetConnectorStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: ImportedConnectorStatus }) =>
      setImportedConnectorStatus(input.id, input.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: externalConnectorsKeys.list(),
      });
    },
  });
}

export function useDeleteConnectorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteImportedConnector(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: externalConnectorsKeys.list(),
      });
    },
  });
}
