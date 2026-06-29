// React Query hooks for the agent Workspace tab. The whole mount tree is fetched
// once and cached per (agent, mount); file reads are cached per path. Mutations
// invalidate the mount tree and the affected file.

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";

import {
  deleteWorkspaceFile,
  getAgentEffectiveInstructions,
  getAgentWorkspace,
  getWorkspaceTree,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "../runtime/workspace-api";

export const agentWorkspaceKeys = {
  all: ["agent-workspace"] as const,
  view: (agentId: string) =>
    [...agentWorkspaceKeys.all, "view", agentId] as const,
  tree: (agentId: string, mount: string) =>
    [...agentWorkspaceKeys.all, "tree", agentId, mount] as const,
  file: (agentId: string, mount: string, path: string) =>
    [...agentWorkspaceKeys.all, "file", agentId, mount, path] as const,
  instructions: (agentId: string) =>
    [...agentWorkspaceKeys.all, "instructions", agentId] as const,
};

export function agentWorkspaceViewOptions(agentId: string) {
  return queryOptions({
    queryKey: agentWorkspaceKeys.view(agentId),
    queryFn: ({ signal }) => getAgentWorkspace(agentId, signal),
    enabled: Boolean(agentId),
  });
}

export function useAgentWorkspaceViewQuery(agentId: string) {
  return useQuery(agentWorkspaceViewOptions(agentId));
}

export function workspaceTreeOptions(agentId: string, mount: string) {
  return queryOptions({
    queryKey: agentWorkspaceKeys.tree(agentId, mount),
    queryFn: ({ signal }) => getWorkspaceTree(agentId, mount, signal),
    enabled: Boolean(agentId && mount),
  });
}

export function useWorkspaceTreeQuery(agentId: string, mount: string) {
  return useQuery(workspaceTreeOptions(agentId, mount));
}

export function workspaceFileOptions(
  agentId: string,
  mount: string,
  path: string
) {
  return queryOptions({
    queryKey: agentWorkspaceKeys.file(agentId, mount, path),
    queryFn: ({ signal }) => readWorkspaceFile(agentId, mount, path, signal),
    enabled: Boolean(agentId && mount && path),
  });
}

export function useWorkspaceFileQuery(
  agentId: string,
  mount: string,
  path: string
) {
  return useQuery(workspaceFileOptions(agentId, mount, path));
}

export function agentEffectiveInstructionsOptions(agentId: string) {
  return queryOptions({
    queryKey: agentWorkspaceKeys.instructions(agentId),
    queryFn: ({ signal }) => getAgentEffectiveInstructions(agentId, signal),
    enabled: Boolean(agentId),
  });
}

export function useAgentEffectiveInstructionsQuery(agentId: string) {
  return useQuery(agentEffectiveInstructionsOptions(agentId));
}

export function useWriteWorkspaceFileMutation(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { mount: string; path: string; content: string }) =>
      writeWorkspaceFile(agentId, input),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: agentWorkspaceKeys.tree(agentId, variables.mount),
        }),
        queryClient.invalidateQueries({
          queryKey: agentWorkspaceKeys.file(
            agentId,
            variables.mount,
            variables.path
          ),
        }),
      ]);
    },
  });
}

export function useDeleteWorkspaceFileMutation(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { mount: string; path: string }) =>
      deleteWorkspaceFile(agentId, input.mount, input.path),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: agentWorkspaceKeys.tree(agentId, variables.mount),
      });
    },
  });
}
