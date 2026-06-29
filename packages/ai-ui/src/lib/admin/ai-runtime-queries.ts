import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { getAiServiceBaseUrl } from "../runtime/ai-service-client.js";
import {
  installSkillFromRegistry,
  listSkillRegistryProviders,
  searchSkillRegistry,
} from "../runtime/skills-api.js";
import {
  type CustomAgentConfig,
  type CustomToolConfig,
  createAiSkill,
  createCustomAgent,
  createCustomTool,
  deleteAdminAiSession,
  deleteAdminAiSessionsForAgent,
  deleteAiSkill,
  deleteAllAdminAiSessions,
  deleteCustomAgent,
  deleteCustomTool,
  getAdminAiSession,
  getAdminAiSessionMessages,
  getAdminAiSessionStats,
  getAdminAiSessions,
  getAiActionDetail,
  getAiActions,
  getAiAgents,
  getAiSkillCatalog,
  getAiSkillDetail,
  getAiSkills,
  getAiTriggers,
  getCustomAgent,
  getCustomTool,
  getRegistryTools,
  patchAiAgentChatPrefs,
  updateAiSkill,
  updateCustomAgent,
  updateCustomTool,
} from "./ai-runtime-api";

export const aiRuntimeKeys = {
  actionDetail: (actionId: string | null) =>
    [...aiRuntimeKeys.all, "action-detail", actionId] as const,
  all: ["ai-runtime"] as const,
  actions: () => [...aiRuntimeKeys.all, "actions"] as const,
  agents: () => [...aiRuntimeKeys.all, "agents"] as const,
  skillCatalog: () => [...aiRuntimeKeys.all, "skill-catalog"] as const,
  skillDetail: (skillId: string | null) =>
    [...aiRuntimeKeys.all, "skill-detail", skillId] as const,
  skillRegistryProviders: () =>
    [...aiRuntimeKeys.all, "skill-registry-providers"] as const,
  skillRegistrySearch: (provider: string | null, query: string) =>
    [...aiRuntimeKeys.all, "skill-registry-search", provider, query] as const,
  skills: () => [...aiRuntimeKeys.all, "skills"] as const,
  adminSessions: (
    agentId: string | null = null,
    userId: string | null = null
  ) => [...aiRuntimeKeys.all, "admin-sessions", agentId, userId] as const,
  adminSessionDetail: (threadId: string | null) =>
    [...aiRuntimeKeys.all, "admin-session-detail", threadId] as const,
  adminSessionMessages: (threadId: string | null) =>
    [...aiRuntimeKeys.all, "admin-session-messages", threadId] as const,
  adminSessionStats: () =>
    [...aiRuntimeKeys.all, "admin-session-stats"] as const,
  sessionRuns: (threadId: string | null, agentId: string | null) =>
    [...aiRuntimeKeys.all, "session-runs", threadId, agentId] as const,
  triggers: () => [...aiRuntimeKeys.all, "triggers"] as const,
  userSessions: () => [...aiRuntimeKeys.all, "user-sessions"] as const,
  userSessionMessages: (threadId: string | null) =>
    [...aiRuntimeKeys.all, "user-session-messages", threadId] as const,
  agentSessions: (agentId: string | null) =>
    [...aiRuntimeKeys.all, "agent-sessions", agentId] as const,
};

export const aiAgentsOptions = queryOptions({
  queryKey: aiRuntimeKeys.agents(),
  queryFn: ({ signal }) => getAiAgents(signal),
  retry: false,
  staleTime: 60_000,
});

export function usePatchAiAgentChatPrefsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      agentId: string;
      patch: {
        include_in_chat_picker?: boolean;
        is_active?: boolean;
        mention_routing_enabled?: boolean;
      };
    }) => patchAiAgentChatPrefs(input.agentId, input.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.agents() });
    },
  });
}

export const aiActionsOptions = queryOptions({
  queryKey: aiRuntimeKeys.actions(),
  queryFn: ({ signal }) => getAiActions(signal),
});

export const aiTriggersOptions = queryOptions({
  queryKey: aiRuntimeKeys.triggers(),
  queryFn: ({ signal }) => getAiTriggers(signal),
});

export function adminAiSessionsOptions(
  input?: { agentId?: string | null; userId?: string | null } | null
) {
  const agentId = input?.agentId ?? null;
  const userId = input?.userId ?? null;
  return queryOptions({
    queryKey: aiRuntimeKeys.adminSessions(agentId, userId),
    queryFn: ({ signal }) =>
      getAdminAiSessions({
        agentId: agentId ?? undefined,
        signal,
        userId: userId ?? undefined,
      }),
  });
}

export function adminAiSessionDetailOptions(threadId: string | null) {
  return queryOptions({
    enabled: Boolean(threadId),
    queryFn: ({ signal }) => getAdminAiSession(threadId ?? "", signal),
    queryKey: aiRuntimeKeys.adminSessionDetail(threadId),
  });
}

export function adminAiSessionMessagesOptions(threadId: string | null) {
  return queryOptions({
    enabled: Boolean(threadId),
    queryFn: ({ signal }) => getAdminAiSessionMessages(threadId ?? "", signal),
    queryKey: aiRuntimeKeys.adminSessionMessages(threadId),
  });
}

export const aiSkillCatalogOptions = queryOptions({
  queryKey: aiRuntimeKeys.skillCatalog(),
  queryFn: ({ signal }) => getAiSkillCatalog(signal),
});

export const aiSkillsOptions = queryOptions({
  queryKey: aiRuntimeKeys.skills(),
  queryFn: ({ signal }) => getAiSkills(signal),
});

export function aiActionDetailOptions(actionId: string | null) {
  return queryOptions({
    enabled: Boolean(actionId),
    queryFn: ({ signal }) => getAiActionDetail(actionId ?? "", signal),
    queryKey: aiRuntimeKeys.actionDetail(actionId),
  });
}

export function aiSkillDetailOptions(skillId: string | null) {
  return queryOptions({
    enabled: Boolean(skillId),
    queryFn: ({ signal }) => getAiSkillDetail(skillId ?? "", signal),
    queryKey: aiRuntimeKeys.skillDetail(skillId),
  });
}

/** Poll the admin sessions list while the activity UI is visible (new sessions appear without reload). */
const RUNS_LIST_POLL_MS = 4000;

export function useAiAgentsQuery(enabled = true) {
  return useQuery({
    ...aiAgentsOptions,
    // Enabled whenever the AI service base URL resolves — either an explicit
    // VITE_ENGENTY_AI_BASE_URL or the same-origin gateway fallback. Gating on the
    // raw env var alone hid the catalog in single-origin (released) setups.
    enabled: enabled && Boolean(getAiServiceBaseUrl()),
  });
}

export function useAiActionsQuery() {
  return useQuery(aiActionsOptions);
}

export function useAiTriggersQuery() {
  return useQuery(aiTriggersOptions);
}

/**
 * @param livePoll Polls the admin sessions list while the corresponding tab is visible
 *   so newly-created sessions surface without a manual refresh.
 */
export function useAdminAiSessionsQuery(
  input?: { agentId?: string | null; userId?: string | null } | null,
  livePoll = false
) {
  return useQuery({
    ...adminAiSessionsOptions(input),
    refetchInterval: () => (livePoll ? RUNS_LIST_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
}

export function useAdminAiSessionDetailQuery(threadId: string | null) {
  return useQuery(adminAiSessionDetailOptions(threadId));
}

export function useAdminAiSessionMessagesQuery(threadId: string | null) {
  return useQuery(adminAiSessionMessagesOptions(threadId));
}

function invalidateAfterAdminSessionMutation(
  queryClient: ReturnType<typeof useQueryClient>,
  params: { agentId: string | null; threadId?: string | null }
) {
  void queryClient.invalidateQueries({
    queryKey: [...aiRuntimeKeys.all, "admin-sessions"],
  });
  void queryClient.invalidateQueries({
    queryKey: [...aiRuntimeKeys.all, "agent-sessions"],
  });
  if (params.threadId) {
    void queryClient.invalidateQueries({
      queryKey: aiRuntimeKeys.adminSessionDetail(params.threadId),
    });
    void queryClient.invalidateQueries({
      queryKey: aiRuntimeKeys.adminSessionMessages(params.threadId),
    });
    void queryClient.invalidateQueries({
      queryKey: aiRuntimeKeys.sessionRuns(params.threadId, params.agentId),
    });
  }
}

export function useDeleteAdminAiSessionMutation(agentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => deleteAdminAiSession(threadId),
    onSuccess: (_data, threadId) => {
      invalidateAfterAdminSessionMutation(queryClient, {
        agentId,
        threadId,
      });
    },
  });
}

export function useDeleteAllAdminAiSessionsForAgentMutation(
  agentId: string | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!agentId) {
        throw new Error("agentId is required");
      }
      return deleteAdminAiSessionsForAgent(agentId);
    },
    onSuccess: () => {
      invalidateAfterAdminSessionMutation(queryClient, { agentId });
    },
  });
}

export const adminAiSessionStatsOptions = queryOptions({
  queryKey: aiRuntimeKeys.adminSessionStats(),
  queryFn: ({ signal }) => getAdminAiSessionStats(signal),
});

export function useAdminAiSessionStatsQuery() {
  return useQuery(adminAiSessionStatsOptions);
}

export function useDeleteAllAdminAiSessionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAllAdminAiSessions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...aiRuntimeKeys.all, "admin-sessions"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...aiRuntimeKeys.all, "admin-session-detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...aiRuntimeKeys.all, "admin-session-messages"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...aiRuntimeKeys.all, "agent-sessions"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...aiRuntimeKeys.all, "session-runs"],
      });
      void queryClient.invalidateQueries({
        queryKey: aiRuntimeKeys.userSessions(),
      });
      void queryClient.invalidateQueries({
        queryKey: aiRuntimeKeys.adminSessionStats(),
      });
    },
  });
}

export function useAiSkillCatalogQuery() {
  return useQuery(aiSkillCatalogOptions);
}

export function useAiSkillsQuery() {
  return useQuery(aiSkillsOptions);
}

export function useAiActionDetailQuery(actionId: string | null) {
  return useQuery(aiActionDetailOptions(actionId));
}

export function useAiSkillDetailQuery(skillId: string | null) {
  return useQuery(aiSkillDetailOptions(skillId));
}

export function useCreateAiSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAiSkill,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.skills() }),
        queryClient.invalidateQueries({
          queryKey: aiRuntimeKeys.skillCatalog(),
        }),
        queryClient.invalidateQueries({
          queryKey: aiRuntimeKeys.skillDetail(result.skill.name),
        }),
      ]);
    },
  });
}

export function useUpdateAiSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAiSkill,
    onSuccess: async (result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.skills() }),
        queryClient.invalidateQueries({
          queryKey: aiRuntimeKeys.skillDetail(result.skill.name),
        }),
        queryClient.invalidateQueries({
          queryKey: aiRuntimeKeys.skillDetail(variables.skillId),
        }),
        queryClient.invalidateQueries({
          queryKey: aiRuntimeKeys.skillCatalog(),
        }),
      ]);
    },
  });
}

export function useDeleteAiSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAiSkill,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.skills() }),
        queryClient.invalidateQueries({
          queryKey: aiRuntimeKeys.skillCatalog(),
        }),
      ]);
    },
  });
}

// Skill registry (skills.sh and other providers): list providers, search a
// provider catalog, and install a skill into the editable custom tier.
export function useAiSkillRegistryProvidersQuery(enabled = true) {
  return useQuery({
    enabled,
    queryFn: ({ signal }) => listSkillRegistryProviders(signal),
    queryKey: aiRuntimeKeys.skillRegistryProviders(),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useAiSkillRegistrySearchQuery(
  provider: string | null,
  query: string,
  enabled: boolean
) {
  return useQuery({
    enabled: enabled && Boolean(provider),
    queryFn: ({ signal }) => searchSkillRegistry(provider ?? "", query, signal),
    queryKey: aiRuntimeKeys.skillRegistrySearch(provider, query),
    retry: false,
  });
}

export function useInstallAiSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: string; ref: { id: string } }) =>
      installSkillFromRegistry(input),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.skills() }),
        queryClient.invalidateQueries({
          queryKey: aiRuntimeKeys.skillCatalog(),
        }),
        queryClient.invalidateQueries({
          queryKey: aiRuntimeKeys.skillDetail(result.skill.name),
        }),
      ]);
    },
  });
}

export const customRegistryKeys = {
  agentDetail: (agentId: string | null) =>
    [...customRegistryKeys.all, "agent-detail", agentId] as const,
  all: ["custom-registry"] as const,
  agents: () => [...customRegistryKeys.all, "agents"] as const,
  toolDetail: (toolId: string | null) =>
    [...customRegistryKeys.all, "tool-detail", toolId] as const,
  tools: () => [...customRegistryKeys.all, "tools"] as const,
};

export function customAgentDetailOptions(agentId: string | null) {
  return queryOptions({
    enabled: Boolean(agentId),
    queryFn: ({ signal }) => getCustomAgent(agentId ?? "", signal),
    queryKey: customRegistryKeys.agentDetail(agentId),
  });
}

export const registryToolsOptions = queryOptions({
  queryKey: customRegistryKeys.tools(),
  queryFn: ({ signal }) => getRegistryTools(signal),
});

export function customToolDetailOptions(toolId: string | null) {
  return queryOptions({
    enabled: Boolean(toolId),
    queryFn: ({ signal }) => getCustomTool(toolId ?? "", signal),
    queryKey: customRegistryKeys.toolDetail(toolId),
  });
}

export function useCustomAgentDetailQuery(agentId: string | null) {
  return useQuery(customAgentDetailOptions(agentId));
}

/** All registry tools (custom DB + module-stamped) from GET /ai/registry/tools. */
export function useAiToolsQuery() {
  return useQuery(registryToolsOptions);
}

export function useCustomToolDetailQuery(toolId: string | null) {
  return useQuery(customToolDetailOptions(toolId));
}

export function useCreateCustomAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomAgent,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.agents(),
        }),
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.agentDetail(result.agent.id),
        }),
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.agents() }),
      ]);
    },
  });
}

export function useUpdateCustomAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      agentId: string;
      patch: Partial<CustomAgentConfig>;
    }) => updateCustomAgent(input.agentId, input.patch),
    onSuccess: async (result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.agents(),
        }),
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.agentDetail(variables.agentId),
        }),
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.agentDetail(result.agent.id),
        }),
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.agents() }),
      ]);
    },
  });
}

export function useDeleteCustomAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomAgent,
    onSuccess: async (_result, agentId) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.agents(),
        }),
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.agentDetail(agentId),
        }),
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.agents() }),
      ]);
    },
  });
}

export function useCreateCustomToolMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomTool,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.tools(),
        }),
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.toolDetail(result.tool.id),
        }),
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.agents() }),
      ]);
    },
  });
}

export function useUpdateCustomToolMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { patch: Partial<CustomToolConfig>; toolId: string }) =>
      updateCustomTool(input.toolId, input.patch),
    onSuccess: async (result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.tools(),
        }),
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.toolDetail(variables.toolId),
        }),
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.toolDetail(result.tool.id),
        }),
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.agents() }),
      ]);
    },
  });
}

export function useDeleteCustomToolMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomTool,
    onSuccess: async (_result, toolId) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.tools(),
        }),
        queryClient.invalidateQueries({
          queryKey: customRegistryKeys.toolDetail(toolId),
        }),
        queryClient.invalidateQueries({ queryKey: aiRuntimeKeys.agents() }),
      ]);
    },
  });
}
