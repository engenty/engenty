import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  createAiInstruction,
  getAiInstructionHistory,
  getAiInstructionResolution,
  getAiInstructionsCatalog,
  type InstructionEditScope,
  resetAiInstruction,
  rollbackAiInstruction,
  updateAiInstruction,
} from "./instruction-settings-api";

export const aiInstructionKeys = {
  all: ["ai-instructions"] as const,
  catalog: () => [...aiInstructionKeys.all, "catalog"] as const,
  history: (documentKey: string, scope: InstructionEditScope) =>
    [...aiInstructionKeys.all, "history", documentKey, scope] as const,
  resolution: (documentKey: string, scope: InstructionEditScope) =>
    [...aiInstructionKeys.all, "resolution", documentKey, scope] as const,
};

export const aiInstructionsCatalogOptions = queryOptions({
  queryKey: aiInstructionKeys.catalog(),
  queryFn: ({ signal }) => getAiInstructionsCatalog(signal),
});

export function aiInstructionResolutionOptions(
  documentKey: string,
  scope: InstructionEditScope
) {
  return queryOptions({
    queryKey: aiInstructionKeys.resolution(documentKey, scope),
    queryFn: ({ signal }) =>
      getAiInstructionResolution(documentKey, scope, signal),
    enabled: Boolean(documentKey),
  });
}

export function aiInstructionHistoryOptions(
  documentKey: string,
  scope: InstructionEditScope
) {
  return queryOptions({
    queryKey: aiInstructionKeys.history(documentKey, scope),
    queryFn: ({ signal }) =>
      getAiInstructionHistory(documentKey, scope, signal),
    enabled: Boolean(documentKey),
  });
}

export function useAiInstructionsCatalogQuery() {
  return useQuery(aiInstructionsCatalogOptions);
}

export function useAiInstructionResolutionQuery(
  documentKey: string,
  scope: InstructionEditScope
) {
  return useQuery(aiInstructionResolutionOptions(documentKey, scope));
}

export function useAiInstructionHistoryQuery(
  documentKey: string,
  scope: InstructionEditScope
) {
  return useQuery(aiInstructionHistoryOptions(documentKey, scope));
}

export function useUpdateAiInstructionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAiInstruction,
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiInstructionKeys.catalog(),
        }),
        queryClient.invalidateQueries({
          queryKey: aiInstructionKeys.resolution(
            variables.documentKey,
            variables.scope
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: aiInstructionKeys.history(
            variables.documentKey,
            variables.scope
          ),
        }),
      ]);
    },
  });
}

export function useCreateAiInstructionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAiInstruction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: aiInstructionKeys.catalog(),
      });
    },
  });
}

export function useRollbackAiInstructionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rollbackAiInstruction,
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiInstructionKeys.catalog(),
        }),
        queryClient.invalidateQueries({
          queryKey: aiInstructionKeys.resolution(
            variables.documentKey,
            variables.scope
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: aiInstructionKeys.history(
            variables.documentKey,
            variables.scope
          ),
        }),
      ]);
    },
  });
}

export function useResetAiInstructionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetAiInstruction,
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiInstructionKeys.catalog(),
        }),
        queryClient.invalidateQueries({
          queryKey: aiInstructionKeys.resolution(
            variables.documentKey,
            variables.scope
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: aiInstructionKeys.history(
            variables.documentKey,
            variables.scope
          ),
        }),
      ]);
    },
  });
}
