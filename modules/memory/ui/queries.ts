import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  applyMemoryDocOps,
  approveMemoryRecord,
  archiveMemoryRecord,
  listScopeRecords,
  listScopeRefs,
  type MemoryScopeQuery,
} from "./api.js";
import type { MemoryDocOp } from "../src/services/memory-doc.js";

export const memoryKeys = {
  all: ["memory"] as const,
  scope: (scope: MemoryScopeQuery) =>
    [...memoryKeys.all, "scope", scope.scope_kind, scope.scope_ref] as const,
  refs: (scopeKind: string) => [...memoryKeys.all, "refs", scopeKind] as const,
};

export function useScopeRecordsQuery(
  scope: MemoryScopeQuery,
  enabled = true
) {
  return useQuery({
    enabled,
    queryKey: memoryKeys.scope(scope),
    queryFn: ({ signal }) => listScopeRecords(scope, signal),
    retry: false,
  });
}

export function useScopeRefsQuery(scopeKind: "project" | "entity") {
  return useQuery({
    queryKey: memoryKeys.refs(scopeKind),
    queryFn: ({ signal }) => listScopeRefs(scopeKind, signal),
    retry: false,
  });
}

export function useSaveMemoryDocMutation(scope: MemoryScopeQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ops: MemoryDocOp[]) => applyMemoryDocOps(scope, ops),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    },
  });
}

export function useApproveMemoryMutation(scope: MemoryScopeQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveMemoryRecord(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: memoryKeys.scope(scope),
      });
    },
  });
}

export function useRejectMemoryMutation(scope: MemoryScopeQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveMemoryRecord(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: memoryKeys.scope(scope),
      });
    },
  });
}
