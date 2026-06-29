"use client";

// Host-scoped thread list context: CRUD against apps/ai, persisted active thread id, optional realtime invalidation.
// Sits under EngentyAI; `useEngentyThreads(hostKey)` is the CopilotKit-shaped list API for embeds.

import type { QueryClient } from "@engenty/query-client";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AppsAiThreadRecord,
  clearAppsAiThreadsForHost,
  deleteAppsAiThread,
  updateAppsAiThread,
} from "../ag-ui/apps-ai/apps-ai-session-api.js";
import { useEngentyAIContext } from "../agent-provider/engenty-ai-provider.js";
import { engentyThreadsListQueryKey } from "./engenty-threads-query-keys.js";
import {
  createEngentyThreadsRealtimeSubscription,
  type EngentyThreadsRealtimeClient,
} from "./engenty-threads-realtime.js";
import { resolveEngentyThreadHostProfile } from "./thread-host-profile.js";
import {
  readActiveThreadIdForHost,
  writeActiveThreadIdForHost,
} from "./threads-active-storage.js";

export interface EngentyThreadsProviderProps {
  children: ReactNode;
  /** Supabase client for realtime list invalidation; omit when unavailable. */
  realtimeClient?: EngentyThreadsRealtimeClient | null;
  tenantId: string;
  userId: string;
}

interface EngentyThreadsContextValue {
  archiveThread: (hostKey: string, threadId: string) => Promise<void>;
  clearThreads: (hostKey: string) => Promise<void>;
  deleteThread: (hostKey: string, threadId: string) => Promise<void>;
  getActiveDraftThreadId: (hostKey: string) => string | null;
  getActiveThreadId: (hostKey: string) => string | null;
  getDraftThreads: (hostKey: string) => AppsAiThreadRecord[];
  invalidateThreads: (hostKey: string) => void;
  isTransportReady: boolean;
  queryClient: QueryClient | undefined;
  removeDraftThread: (hostKey: string, threadId: string) => void;
  renameThread: (
    hostKey: string,
    threadId: string,
    title: string
  ) => Promise<void>;
  serviceBaseUrl: string;
  setActiveThreadId: (hostKey: string, threadId: string | null) => void;
  tenantId: string;
  threadsListQueryKey: (
    hostKey: string,
    options?: { includeArchived?: boolean }
  ) => readonly unknown[];
  upsertDraftThread: (hostKey: string, thread: AppsAiThreadRecord) => void;
  userId: string;
}

const EngentyThreadsContext = createContext<EngentyThreadsContextValue | null>(
  null
);

export function EngentyThreadsProvider(props: EngentyThreadsProviderProps) {
  const ai = useEngentyAIContext();
  const [activeRevision, setActiveRevision] = useState(0);
  const [draftThreadsByHost, setDraftThreadsByHost] = useState<
    Record<string, AppsAiThreadRecord[]>
  >({});
  const [activeDraftThreadByHost, setActiveDraftThreadByHost] = useState<
    Record<string, string | null>
  >({});
  const bumpActiveRevision = useCallback(() => {
    setActiveRevision((value) => value + 1);
  }, []);

  const invalidateThreads = useCallback(
    (hostKey: string) => {
      if (!ai.queryClient) {
        return;
      }
      void ai.queryClient.invalidateQueries({
        queryKey: engentyThreadsListQueryKey({
          hostKey,
          serviceBaseUrl: ai.serviceBaseUrl,
        }),
      });
    },
    [ai.queryClient, ai.serviceBaseUrl]
  );

  const setActiveThreadId = useCallback(
    (hostKey: string, threadId: string | null) => {
      writeActiveThreadIdForHost(hostKey, threadId);
      bumpActiveRevision();
    },
    [bumpActiveRevision]
  );

  const getActiveThreadId = useCallback(
    (hostKey: string) => {
      void activeRevision;
      return readActiveThreadIdForHost(hostKey);
    },
    [activeRevision]
  );

  const getDraftThreads = useCallback(
    (hostKey: string) => draftThreadsByHost[hostKey] ?? [],
    [draftThreadsByHost]
  );

  const getActiveDraftThreadId = useCallback(
    (hostKey: string) => activeDraftThreadByHost[hostKey] ?? null,
    [activeDraftThreadByHost]
  );

  const upsertDraftThread = useCallback(
    (hostKey: string, thread: AppsAiThreadRecord) => {
      setDraftThreadsByHost((current) => {
        const rows = current[hostKey] ?? [];
        const nextRows = [
          thread,
          ...rows.filter((row) => row.id !== thread.id),
        ];
        return { ...current, [hostKey]: nextRows };
      });
      setActiveDraftThreadByHost((current) => ({
        ...current,
        [hostKey]: thread.id,
      }));
    },
    []
  );

  const removeDraftThread = useCallback((hostKey: string, threadId: string) => {
    setDraftThreadsByHost((current) => {
      const rows = current[hostKey] ?? [];
      const nextRows = rows.filter((row) => row.id !== threadId);
      if (nextRows.length === rows.length) {
        return current;
      }
      return { ...current, [hostKey]: nextRows };
    });
    setActiveDraftThreadByHost((current) =>
      current[hostKey] === threadId ? { ...current, [hostKey]: null } : current
    );
  }, []);

  const renameThread = useCallback(
    async (hostKey: string, threadId: string, title: string) => {
      if (!ai.isTransportReady) {
        throw new Error("missing_scope");
      }
      await updateAppsAiThread({
        serviceBaseUrl: ai.serviceBaseUrl,
        threadId,
        title: title.trim() || null,
      });
      invalidateThreads(hostKey);
    },
    [ai.isTransportReady, ai.serviceBaseUrl, invalidateThreads]
  );

  const archiveThread = useCallback(
    async (hostKey: string, threadId: string) => {
      if (!ai.isTransportReady) {
        throw new Error("missing_scope");
      }
      await updateAppsAiThread({
        archived: true,
        serviceBaseUrl: ai.serviceBaseUrl,
        threadId,
      });
      const active = readActiveThreadIdForHost(hostKey);
      if (active === threadId) {
        writeActiveThreadIdForHost(hostKey, null);
        bumpActiveRevision();
      }
      invalidateThreads(hostKey);
    },
    [
      ai.isTransportReady,
      ai.serviceBaseUrl,
      bumpActiveRevision,
      invalidateThreads,
    ]
  );

  const deleteThread = useCallback(
    async (hostKey: string, threadId: string) => {
      if (!ai.isTransportReady) {
        throw new Error("missing_scope");
      }
      await deleteAppsAiThread({
        serviceBaseUrl: ai.serviceBaseUrl,
        threadId,
      });
      const active = readActiveThreadIdForHost(hostKey);
      if (active === threadId) {
        writeActiveThreadIdForHost(hostKey, null);
        bumpActiveRevision();
      }
      const listQueryKey = engentyThreadsListQueryKey({
        hostKey,
        serviceBaseUrl: ai.serviceBaseUrl,
      });
      if (ai.queryClient) {
        ai.queryClient.setQueryData(
          listQueryKey,
          (current: AppsAiThreadRecord[] | undefined) =>
            (current ?? []).filter((thread) => thread.id !== threadId)
        );
      }
    },
    [
      ai.isTransportReady,
      ai.serviceBaseUrl,
      bumpActiveRevision,
      invalidateThreads,
    ]
  );

  const clearThreads = useCallback(
    async (hostKey: string) => {
      if (!ai.isTransportReady) {
        throw new Error("missing_scope");
      }
      const profile = resolveEngentyThreadHostProfile(hostKey);
      const listQueryKey = engentyThreadsListQueryKey({
        hostKey,
        serviceBaseUrl: ai.serviceBaseUrl,
      });
      const cachedThreads =
        (ai.queryClient?.getQueryData(listQueryKey) as
          | AppsAiThreadRecord[]
          | undefined) ?? [];

      if (ai.queryClient) {
        await ai.queryClient.cancelQueries({ queryKey: listQueryKey });
        ai.queryClient.setQueryData(listQueryKey, []);
      }

      try {
        await clearAppsAiThreadsForHost({
          agentId: profile.agentId,
          hostKey: profile.hostKey,
          limit: profile.listLimit,
          serviceBaseUrl: ai.serviceBaseUrl,
          threadIds: cachedThreads.map((thread) => thread.id),
        });
      } catch (error) {
        if (ai.queryClient) {
          void ai.queryClient.invalidateQueries({ queryKey: listQueryKey });
        }
        throw error;
      }

      writeActiveThreadIdForHost(hostKey, null);
      bumpActiveRevision();
      if (ai.queryClient) {
        ai.queryClient.setQueryData(listQueryKey, []);
      }
    },
    [
      ai.isTransportReady,
      ai.serviceBaseUrl,
      bumpActiveRevision,
      invalidateThreads,
    ]
  );

  const onRealtimeChangeRef = useRef(() => {
    if (!ai.queryClient) {
      return;
    }
    void ai.queryClient.invalidateQueries({
      queryKey: ["apps-ai", "sessions", "list", ai.serviceBaseUrl],
    });
  });
  onRealtimeChangeRef.current = () => {
    if (!ai.queryClient) {
      return;
    }
    void ai.queryClient.invalidateQueries({
      queryKey: ["apps-ai", "sessions", "list", ai.serviceBaseUrl],
    });
  };

  useEffect(() => {
    const subscription = createEngentyThreadsRealtimeSubscription({
      client: props.realtimeClient ?? null,
      onThreadsChange: () => onRealtimeChangeRef.current(),
      tenantId: props.tenantId,
      userId: props.userId,
    });
    return () => subscription?.unsubscribe();
  }, [props.realtimeClient, props.tenantId, props.userId]);

  const value = useMemo<EngentyThreadsContextValue>(
    () => ({
      archiveThread,
      clearThreads,
      deleteThread,
      getActiveDraftThreadId,
      getActiveThreadId,
      getDraftThreads,
      invalidateThreads,
      isTransportReady: ai.isTransportReady,
      queryClient: ai.queryClient,
      removeDraftThread,
      renameThread,
      serviceBaseUrl: ai.serviceBaseUrl,
      setActiveThreadId,
      tenantId: props.tenantId,
      threadsListQueryKey: (hostKey, options) =>
        engentyThreadsListQueryKey({
          hostKey,
          includeArchived: options?.includeArchived,
          serviceBaseUrl: ai.serviceBaseUrl,
        }),
      upsertDraftThread,
      userId: props.userId,
    }),
    [
      archiveThread,
      ai.isTransportReady,
      ai.queryClient,
      ai.serviceBaseUrl,
      clearThreads,
      deleteThread,
      getActiveDraftThreadId,
      getActiveThreadId,
      getDraftThreads,
      invalidateThreads,
      props.tenantId,
      removeDraftThread,
      renameThread,
      setActiveThreadId,
      upsertDraftThread,
      props.userId,
    ]
  );

  return (
    <EngentyThreadsContext.Provider value={value}>
      {props.children}
    </EngentyThreadsContext.Provider>
  );
}

export function useEngentyThreadsContext(): EngentyThreadsContextValue {
  const value = useContext(EngentyThreadsContext);
  if (!value) {
    throw new Error(
      "useEngentyThreadsContext must be used within EngentyThreadsProvider"
    );
  }
  return value;
}
