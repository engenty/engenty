import { spaceKeyFromPathname } from "@engenty/ai-core/browser";
import {
  type AiRegisteredAgent,
  ENGENTY_COPILOT_HOST_KEY,
  useAiAgentsQuery,
  useCopilotThreadActions,
  useCopilotThreadBinding,
  useEngentyAIContext,
  useEngentyThreads,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
import {
  cn,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  chatSearchHitsToThreads,
  searchAgentChatThreads,
} from "../../../src/lib/agent-chat-search-client.js";
import type { AgentThreadDto } from "../../../src/lib/agent-thread-types.js";
import { formatCopilotThreadShortId } from "../../../src/lib/thread-label.js";
import { errorMessage } from "../../lib/chat/chat-errors.js";
import { agentChatSearchQueryKey } from "../../lib/chat/chat-model.js";
import {
  copilotSpaceOrder,
  copilotSpacesQueryOptions,
} from "../../lib/copilot-spaces.js";
import { CopilotModuleErrorBoundary } from "../copilot-module-error-boundary.js";
import { ThreadListBody } from "./thread-list-body.js";
import { ThreadListProvider } from "./thread-list-context.js";
import { ThreadListHeader } from "./thread-list-header.js";
import {
  DEFAULT_THREAD_LIST_PREFS,
  organizeThreadList,
  type ThreadListOrganizationLabels,
  type ThreadListOrganizationPrefs,
} from "./thread-list-organization.js";
import type { ThreadListState } from "./types.js";

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [delayMs, value]);
  return debounced;
}

/** Thread sidebar — host-scoped thread list via `useEngentyThreads`. */
export function ThreadList(props: { className?: string }) {
  const { t } = useTranslation("engenty-copilot");
  const { t: tc } = useTranslation("common");
  const binding = useCopilotThreadBinding();
  const { isTransportReady, serviceBaseUrl } = useEngentyAIContext();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<ThreadListOrganizationPrefs>(
    DEFAULT_THREAD_LIST_PREFS
  );
  const { currentSpace } = useWorkspaceContext();
  const location = useLocation();
  // Read from the PATHNAME: `currentSpace` falls back to the tenant default
  // outside `/s/…` and would otherwise filter the root list to that space.
  const inSpace = spaceKeyFromPathname(location.pathname) != null;
  // Inside a space the list is locked to that space's chats. At tenant root
  // the default is `all`; `current` there still means the fallback space.
  const spaceId =
    inSpace || prefs.spaceScope === "current"
      ? (currentSpace?.id ?? null)
      : null;
  const threads = useEngentyThreads(ENGENTY_COPILOT_HOST_KEY, {
    activeThreadIdOverride: binding.activeThreadId,
    spaceId,
  });
  const { deleteSession, selectSession, isDeletingSession } =
    useCopilotThreadActions();
  const [searchQuery, setSearchQuery] = useState("");
  const agentsQuery = useAiAgentsQuery(true);
  const registryAgents = useMemo(
    (): AiRegisteredAgent[] => agentsQuery.data?.agents ?? [],
    [agentsQuery.data?.agents]
  );
  const labels = useMemo(
    () => ({
      deleteSession: t("chat.deleteSession"),
      activeChats: t("chat.activeChats"),
      agent: t("chat.agent"),
      age: t("chat.age"),
      ageAll: t("chat.ageAll"),
      ageLastSevenDays: t("chat.ageLastSevenDays"),
      ageLastThirtyDays: t("chat.ageLastThirtyDays"),
      ageLastTwoDays: t("chat.ageLastTwoDays"),
      allAgents: t("chat.allAgents"),
      allChats: t("chat.allChats"),
      allStatuses: t("chat.allStatuses"),
      archivedChats: t("chat.archivedChats"),
      dateOlder: t("chat.dateOlder"),
      datePreviousSevenDays: t("chat.datePreviousSevenDays"),
      dateToday: t("chat.dateToday"),
      dateYesterday: t("chat.dateYesterday"),
      groupAgent: t("chat.groupAgent"),
      draftSession: t("chat.draftSession"),
      groupBy: t("chat.groupBy"),
      groupDate: t("chat.groupDate"),
      groupNone: t("chat.groupNone"),
      groupNoneShort: t("chat.groupNoneShort"),
      groupSpace: t("chat.groupSpace"),
      groupStatus: t("chat.groupStatus"),
      groupType: t("chat.groupType"),
      listSettings: t("chat.listSettings"),
      listLoadFailedTitle: t("chat.listLoadFailedTitle"),
      moduleErrorDescription: t("chat.moduleErrorDescription"),
      moduleErrorReload: t("chat.moduleErrorReload"),
      moduleErrorTitle: t("chat.moduleErrorTitle"),
      loading: tc("shell.loading"),
      missingScope: t("chat.missingScope"),
      missingService: t("chat.missingAiBaseUrl"),
      noSearchResults: t("chat.noSearchResults"),
      noSessions: t("chat.noSessions"),
      retry: t("chat.retry"),
      sortAgent: t("chat.sortAgent"),
      sortAscending: t("chat.sortAscending"),
      sortBy: t("chat.sortBy"),
      sortCreated: t("chat.sortCreated"),
      sortDescending: t("chat.sortDescending"),
      sortTitle: t("chat.sortTitle"),
      sortUpdated: t("chat.sortUpdated"),
      spaceScope: t("chat.spaceScope"),
      spaceNone: t("chat.spaceNone"),
      spaceScopeAll: t("chat.spaceScopeAll"),
      spaceScopeCurrent: t("chat.spaceScopeCurrent"),
      searchPlaceholder: t("chat.searchChats"),
      sessionMenu: t("chat.sessionMenu"),
      status: t("chat.status"),
      statusCompleted: t("chat.statusCompleted"),
      statusDraft: t("chat.statusDraft"),
      statusFailed: t("chat.statusFailed"),
      statusIdle: t("chat.statusIdle"),
      statusRunning: t("chat.statusRunning"),
      statusWaiting: t("chat.statusWaiting"),
      typeFallback: t("chat.typeChat"),
      visibility: t("chat.visibility"),
    }),
    [t, tc]
  );
  const threadLabel = useCallback(
    (row: AgentThreadDto) =>
      row.title?.trim() ||
      (row.status === "draft" ? t("chat.draftSession") : null) ||
      t("chat.untitledSession", {
        shortId: formatCopilotThreadShortId(row.id),
      }),
    [t]
  );
  const agentLabelById = useMemo(
    () =>
      new Map(
        registryAgents.map((agent) => [
          agent.id,
          agent.name?.trim() || agent.id,
        ])
      ),
    [registryAgents]
  );
  const threadAgentLabel = useCallback(
    (row: AgentThreadDto) => agentLabelById.get(row.agent_id) || row.agent_id,
    [agentLabelById]
  );
  const agentOptions = useMemo(
    () =>
      registryAgents.map((agent) => ({
        id: agent.id,
        name: agent.name?.trim() || agent.id,
      })),
    [registryAgents]
  );
  const spacesQuery = useQuery(copilotSpacesQueryOptions);
  const spaces = spacesQuery.data ?? [];
  const spaceOrder = useMemo(() => copilotSpaceOrder(spaces), [spaces]);
  const spaceNameById = useMemo(
    () => new Map(spaces.map((space) => [space.id, space.name])),
    [spaces]
  );
  const spaceLabel = useCallback(
    (spaceId: string | null) => {
      if (!spaceId) {
        return t("chat.spaceNone");
      }
      return spaceNameById.get(spaceId) ?? t("chat.spaceUnknown");
    },
    [spaceNameById, t]
  );

  const normalizedSearchQuery = searchQuery.trim();
  const debouncedSearchQuery = useDebouncedValue(normalizedSearchQuery, 200);
  const isSearchActive = normalizedSearchQuery.length > 0;
  const isDebouncingSearch =
    isSearchActive && normalizedSearchQuery !== debouncedSearchQuery;
  const searchQueryResult = useQuery({
    queryKey: agentChatSearchQueryKey({
      agentId: null,
      query: debouncedSearchQuery,
      tenantId: binding.tenantId,
      userId: binding.userId,
    }),
    queryFn: ({ signal }) =>
      searchAgentChatThreads({
        agentId: null,
        limit: 25,
        query: debouncedSearchQuery,
        serviceBaseUrl,
        signal,
        tenantId: binding.tenantId,
        userId: binding.userId,
      }),
    enabled: isTransportReady && debouncedSearchQuery.length > 0,
  });
  const searchThreads = useMemo(() => {
    const mapped = chatSearchHitsToThreads({
      hits: searchQueryResult.data?.matches ?? [],
      knownThreads: threads.threads as AgentThreadDto[],
    });
    if (!spaceId) {
      return mapped;
    }
    const knownIds = new Set(
      (threads.threads as AgentThreadDto[]).map((thread) => thread.id)
    );
    return mapped.filter(
      (thread) => thread.space_id === spaceId || knownIds.has(thread.id)
    );
  }, [searchQueryResult.data?.matches, spaceId, threads.threads]);
  const visibleThreads = isSearchActive
    ? searchThreads
    : (threads.threads as AgentThreadDto[]);
  const organizationLabels = useMemo(
    (): ThreadListOrganizationLabels => ({
      activeChats: labels.activeChats,
      archivedChats: labels.archivedChats,
      dateOlder: labels.dateOlder,
      datePreviousSevenDays: labels.datePreviousSevenDays,
      dateToday: labels.dateToday,
      dateYesterday: labels.dateYesterday,
      spaceNone: labels.spaceNone,
      status: {
        draft: labels.statusDraft,
        completed: labels.statusCompleted,
        failed: labels.statusFailed,
        idle: labels.statusIdle,
        running: labels.statusRunning,
        waiting: labels.statusWaiting,
      },
      typeFallback: labels.typeFallback,
    }),
    [labels]
  );
  const groups = useMemo(
    () =>
      organizeThreadList({
        agentLabel: (agentId) => agentLabelById.get(agentId) || agentId,
        labels: organizationLabels,
        prefs,
        spaceLabel,
        spaceOrder,
        threads: visibleThreads,
      }),
    [
      agentLabelById,
      organizationLabels,
      prefs,
      spaceLabel,
      spaceOrder,
      visibleThreads,
    ]
  );
  const organizedThreads = useMemo(
    () => groups.flatMap((group) => group.threads),
    [groups]
  );
  const statusOptions = useMemo(
    () => [
      { label: labels.statusDraft, value: "draft" as const },
      { label: labels.statusRunning, value: "running" as const },
      { label: labels.statusWaiting, value: "waiting" as const },
      { label: labels.statusFailed, value: "failed" as const },
      { label: labels.statusCompleted, value: "completed" as const },
      { label: labels.statusIdle, value: "idle" as const },
    ],
    [labels]
  );
  const isListError = isSearchActive
    ? searchQueryResult.isError
    : Boolean(threads.error);
  const listErrorSource = isSearchActive
    ? searchQueryResult.error
    : threads.error;
  const listErrorDescription = listErrorSource
    ? errorMessage(listErrorSource)
    : null;
  const listErrorTitle = isListError ? labels.listLoadFailedTitle : null;
  const handleRetryList = useCallback(() => {
    if (isSearchActive) {
      void queryClient.invalidateQueries({
        queryKey: agentChatSearchQueryKey({
          agentId: null,
          query: debouncedSearchQuery,
          tenantId: binding.tenantId,
          userId: binding.userId,
        }),
      });
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: threads.threadsListQueryKey,
    });
  }, [
    binding.tenantId,
    binding.userId,
    debouncedSearchQuery,
    isSearchActive,
    queryClient,
    threads.threadsListQueryKey,
  ]);
  const isListLoading = isSearchActive
    ? isDebouncingSearch || searchQueryResult.isLoading
    : threads.isLoading;

  const handleSelect = selectSession;
  const handleDelete = deleteSession;

  const state = useMemo(
    (): ThreadListState => ({
      agentOptions,
      deletePending: isDeletingSession,
      groups,
      isError: isListError,
      isLoading: isListLoading,
      isSearchActive,
      isTransportReady,
      labels,
      listErrorDescription,
      listErrorTitle,
      onDeleteThread: handleDelete,
      onRetryList: handleRetryList,
      onPrefsChange: setPrefs,
      onSearchQueryChange: setSearchQuery,
      onSelectThread: handleSelect,
      prefs: inSpace ? { ...prefs, spaceScope: "current" as const } : prefs,
      searchQuery,
      selectedThreadId: threads.activeThreadId,
      serviceBaseUrlPresent: serviceBaseUrl.length > 0,
      spaceScopeLocked: inSpace,
      threadAgentLabel,
      threadLabel,
      threads: organizedThreads,
      statusOptions,
    }),
    [
      agentOptions,
      isDeletingSession,
      isTransportReady,
      inSpace,
      serviceBaseUrl.length,
      groups,
      handleDelete,
      handleSelect,
      isListError,
      isListLoading,
      isSearchActive,
      labels,
      listErrorDescription,
      listErrorTitle,
      handleRetryList,
      organizedThreads,
      prefs,
      searchQuery,
      threadAgentLabel,
      threadLabel,
      statusOptions,
      threads.activeThreadId,
    ]
  );

  return (
    <CopilotModuleErrorBoundary
      description={labels.moduleErrorDescription}
      reloadLabel={labels.moduleErrorReload}
      title={labels.moduleErrorTitle}
    >
      <ThreadListProvider value={state}>
        <aside
          className={cn(
            "flex h-full min-h-0 w-full flex-1 flex-col border-0 bg-transparent shadow-none",
            props.className
          )}
        >
          <ThreadListHeader />
          <SidebarContent className="px-0 py-0">
            <SidebarGroup className="p-0 pb-2">
              <SidebarGroupContent>
                <ThreadListBody />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </aside>
      </ThreadListProvider>
    </CopilotModuleErrorBoundary>
  );
}
