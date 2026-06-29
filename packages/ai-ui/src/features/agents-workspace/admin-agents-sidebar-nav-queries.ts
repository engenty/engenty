import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { useCallback } from "react";
import {
  fetchAdminAgentsSidebarNavUserSetting,
  saveAdminAgentsSidebarNavUserSetting,
} from "./admin-agents-sidebar-nav-api";
import {
  type AdminAgentsSidebarNavStateV1,
  clampAdminAgentsAsideWidthPx,
  DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE,
  parseAdminAgentsSidebarNavFromUnknown,
  type WorkspaceNavModuleFoldersState,
  type WorkspaceNavSectionsState,
} from "./admin-agents-sidebar-nav-state";

export const adminAgentsSidebarNavKeys = {
  all: ["user-settings", "admin_agents_sidebar_nav_state"] as const,
};

export function adminAgentsSidebarNavQueryOptions() {
  return queryOptions({
    queryFn: async ({ signal }) => {
      const res = await fetchAdminAgentsSidebarNavUserSetting(signal);
      if (res.value === null) {
        return { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
      }
      if (
        res.type === "json" &&
        res.value !== null &&
        typeof res.value === "object" &&
        !Array.isArray(res.value)
      ) {
        return parseAdminAgentsSidebarNavFromUnknown(res.value);
      }
      return { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
    },
    queryKey: adminAgentsSidebarNavKeys.all,
    staleTime: 60_000,
  });
}

export function useAdminAgentsSidebarNavPersistence() {
  const queryClient = useQueryClient();
  const query = useQuery(adminAgentsSidebarNavQueryOptions());

  const saveMutation = useMutation({
    mutationFn: saveAdminAgentsSidebarNavUserSetting,
    onSuccess: (res) => {
      if (
        res.type === "json" &&
        res.value !== null &&
        typeof res.value === "object" &&
        !Array.isArray(res.value)
      ) {
        queryClient.setQueryData(
          adminAgentsSidebarNavKeys.all,
          parseAdminAgentsSidebarNavFromUnknown(res.value)
        );
      }
    },
  });

  const patchAndSave = useCallback(
    (next: AdminAgentsSidebarNavStateV1) => {
      queryClient.setQueryData(adminAgentsSidebarNavKeys.all, next);
      saveMutation.mutate(next);
    },
    [queryClient, saveMutation]
  );

  const patchSections = useCallback(
    (partial: Partial<WorkspaceNavSectionsState>) => {
      const prev = queryClient.getQueryData<AdminAgentsSidebarNavStateV1>(
        adminAgentsSidebarNavKeys.all
      ) ?? { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
      const next: AdminAgentsSidebarNavStateV1 = {
        asideWidthPx: prev.asideWidthPx,
        moduleFolders: prev.moduleFolders,
        pinnedAgents: prev.pinnedAgents,
        pinnedSessions: prev.pinnedSessions,
        sections: { ...prev.sections, ...partial },
        v: 1,
      };
      patchAndSave(next);
    },
    [patchAndSave, queryClient]
  );

  const toggleFolder = useCallback(
    (section: "actions" | "skills", moduleId: string) => {
      const prev = queryClient.getQueryData<AdminAgentsSidebarNavStateV1>(
        adminAgentsSidebarNavKeys.all
      ) ?? { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
      const current = prev.moduleFolders[section][moduleId] === true;
      const nextFolders: WorkspaceNavModuleFoldersState = {
        ...prev.moduleFolders,
        [section]: { ...prev.moduleFolders[section], [moduleId]: !current },
      };
      patchAndSave({
        asideWidthPx: prev.asideWidthPx,
        moduleFolders: nextFolders,
        pinnedAgents: prev.pinnedAgents,
        pinnedSessions: prev.pinnedSessions,
        sections: prev.sections,
        v: 1,
      });
    },
    [patchAndSave, queryClient]
  );

  const setAsideWidthPx = useCallback(
    (widthPx: number) => {
      const prev = queryClient.getQueryData<AdminAgentsSidebarNavStateV1>(
        adminAgentsSidebarNavKeys.all
      ) ?? { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
      patchAndSave({
        ...prev,
        asideWidthPx: clampAdminAgentsAsideWidthPx(widthPx),
        v: 1,
      });
    },
    [patchAndSave, queryClient]
  );

  const pinAgent = useCallback(
    (agentId: string) => {
      const prev = queryClient.getQueryData<AdminAgentsSidebarNavStateV1>(
        adminAgentsSidebarNavKeys.all
      ) ?? { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
      if (prev.pinnedAgents.includes(agentId)) {
        return;
      }
      patchAndSave({
        ...prev,
        pinnedAgents: [...prev.pinnedAgents, agentId],
        pinnedSessions: prev.pinnedSessions,
        v: 1,
      });
    },
    [patchAndSave, queryClient]
  );

  const unpinAgent = useCallback(
    (agentId: string) => {
      const prev = queryClient.getQueryData<AdminAgentsSidebarNavStateV1>(
        adminAgentsSidebarNavKeys.all
      ) ?? { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
      patchAndSave({
        ...prev,
        pinnedAgents: prev.pinnedAgents.filter((id) => id !== agentId),
        pinnedSessions: prev.pinnedSessions,
        v: 1,
      });
    },
    [patchAndSave, queryClient]
  );

  const pinSession = useCallback(
    (threadId: string) => {
      const prev = queryClient.getQueryData<AdminAgentsSidebarNavStateV1>(
        adminAgentsSidebarNavKeys.all
      ) ?? { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
      if (prev.pinnedSessions.includes(threadId)) {
        return;
      }
      patchAndSave({
        ...prev,
        pinnedSessions: [...prev.pinnedSessions, threadId],
        v: 1,
      });
    },
    [patchAndSave, queryClient]
  );

  const unpinSession = useCallback(
    (threadId: string) => {
      const prev = queryClient.getQueryData<AdminAgentsSidebarNavStateV1>(
        adminAgentsSidebarNavKeys.all
      ) ?? { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
      patchAndSave({
        ...prev,
        pinnedSessions: prev.pinnedSessions.filter((id) => id !== threadId),
        v: 1,
      });
    },
    [patchAndSave, queryClient]
  );

  const merged = query.data ?? { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };

  return {
    actionsOpen: merged.sections.actionsOpen,
    agentsOpen: merged.sections.agentsOpen,
    isFolderOpen: (section: "actions" | "skills", moduleId: string) =>
      merged.moduleFolders[section][moduleId] === true,
    asideWidthPx: merged.asideWidthPx,
    isPending: query.isPending,
    pinAgent,
    pinSession,
    pinnedAgents: merged.pinnedAgents,
    pinnedSessions: merged.pinnedSessions,
    setActionsOpen: (open: boolean) => patchSections({ actionsOpen: open }),
    setAgentsOpen: (open: boolean) => patchSections({ agentsOpen: open }),
    setAsideWidthPx,
    setSkillsOpen: (open: boolean) => patchSections({ skillsOpen: open }),
    skillsOpen: merged.sections.skillsOpen,
    toggleFolder,
    unpinAgent,
    unpinSession,
  };
}
