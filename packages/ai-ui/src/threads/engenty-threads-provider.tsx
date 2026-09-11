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
  appsAiThreadQueryRoot,
  appsAiThreadsListQueryKeyPrefix,
  clearAppsAiThreadsForHost,
  deleteAppsAiThread,
  updateAppsAiThread,
} from "../ag-ui/apps-ai/apps-ai-thread-api.js";
import { useEngentyAIContext } from "../agent-provider/engenty-ai-provider.js";
import { artifactsQueryRoot } from "../artifacts/artifacts-api.js";
import { createArtifactsRealtimeSubscription } from "../artifacts/artifacts-realtime.js";
import { engentyThreadsListQueryKey } from "./engenty-threads-query-keys.js";
import {
  createEngentyThreadsRealtimeSubscription,
  type EngentyThreadsRealtimeClient,
} from "./engenty-threads-realtime.js";
import { resolveEngentyThreadHostProfile } from "./thread-host-profile.js";
import {
  activeThreadStorageKey,
  readActiveThreadIdForHost,
  writeActiveThreadIdForHost,
} from "./threads-active-storage.js";

export interface EngentyThreadsProviderProps {
  /**
   * The space a SPACE-BOUND host's active thread belongs to
   * (PLAN-space-chats.md). Only the copilot is space-bound today; every other
   * host ignores this and keeps its bare host key.
   *
   * Must be the space the COPILOT considers itself in — the personal space
   * outside `/s/…`, not the tenant default — or the dock outside a space binds
   * to a space nobody chose. `resolveCopilotSpaceId` is that answer.
   */
  activeThreadSpaceId?: string | null;
  children: ReactNode;
  /** Supabase client for realtime list invalidation; omit when unavailable. */
  realtimeClient?: EngentyThreadsRealtimeClient | null;
  tenantId: string;
  userId: string;
}

interface EngentyThreadsContextValue {
  /**
   * The space a space-bound host's active thread is remembered under — the
   * copilot's own answer, not the route's fallback.
   *
   * Published rather than re-derived by consumers on purpose: the entry
   * redirect has to read the SAME key the provider writes, and computing it a
   * second time from `currentSpace` gets a different answer outside `/s/…`
   * (tenant default vs personal space). The symptom would be a chat entry that
   * never resumes what you were last in, which reads as the binding being lost.
   */
  activeThreadSpaceId: string | null;
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
    options?: { includeArchived?: boolean; spaceId?: string | null }
  ) => readonly unknown[];
  upsertDraftThread: (hostKey: string, thread: AppsAiThreadRecord) => void;
  userId: string;
}

const EngentyThreadsContext = createContext<EngentyThreadsContextValue | null>(
  null
);

export function EngentyThreadsProvider(props: EngentyThreadsProviderProps) {
  const ai = useEngentyAIContext();
  const activeThreadSpaceId = props.activeThreadSpaceId ?? null;
  const [activeRevision, setActiveRevision] = useState(0);
  /**
   * Where this host's active thread is remembered.
   *
   * Every read AND every write goes through this, which is the point: scoping
   * one side only would have the dock reading a key nothing ever wrote, and
   * silently losing the binding on every navigation.
   */
  const storageKeyFor = useCallback(
    (hostKey: string) =>
      resolveEngentyThreadHostProfile(hostKey).spaceBound
        ? activeThreadStorageKey(hostKey, activeThreadSpaceId)
        : hostKey,
    [activeThreadSpaceId]
  );
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
      // …and every HOST-AGNOSTIC list, which is what a space's Chats view is:
      // one query per space with no host key at all (PLAN-space-chats.md). A
      // copilot run invalidates the copilot's list by host key, and that key
      // prefix-matches nothing in the space list — so without this the space's
      // conversations silently stop updating the moment you have a chat, which
      // reads as a broken list rather than a missed invalidation.
      //
      // Only MOUNTED queries refetch, so in practice this is the one extra
      // list actually on screen.
      void ai.queryClient.invalidateQueries({
        queryKey: appsAiThreadsListQueryKeyPrefix({
          serviceBaseUrl: ai.serviceBaseUrl,
        }),
      });
    },
    [ai.queryClient, ai.serviceBaseUrl]
  );

  const setActiveThreadId = useCallback(
    (hostKey: string, threadId: string | null) => {
      writeActiveThreadIdForHost(storageKeyFor(hostKey), threadId);
      bumpActiveRevision();
    },
    [bumpActiveRevision, storageKeyFor]
  );

  const getActiveThreadId = useCallback(
    (hostKey: string) => {
      void activeRevision;
      return readActiveThreadIdForHost(storageKeyFor(hostKey));
    },
    [activeRevision, storageKeyFor]
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
      const storageKey = storageKeyFor(hostKey);
      const active = readActiveThreadIdForHost(storageKey);
      if (active === threadId) {
        writeActiveThreadIdForHost(storageKey, null);
        bumpActiveRevision();
      }
      invalidateThreads(hostKey);
    },
    [
      ai.isTransportReady,
      ai.serviceBaseUrl,
      bumpActiveRevision,
      invalidateThreads,
      storageKeyFor,
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
      const storageKey = storageKeyFor(hostKey);
      const active = readActiveThreadIdForHost(storageKey);
      if (active === threadId) {
        writeActiveThreadIdForHost(storageKey, null);
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
      storageKeyFor,
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

      writeActiveThreadIdForHost(storageKeyFor(hostKey), null);
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
      storageKeyFor,
    ]
  );

  // Prefix-invalidate every thread list for this service: a realtime row change
  // carries no hostKey/agentId, and the full key is
  // [...root, "list", serviceBaseUrl, hostKey, agentId, archived] — stopping at
  // serviceBaseUrl matches all of them. Must be built from the shared key
  // helpers: a hand-written literal silently matches NOTHING (it did — the
  // thread/session rename left `"sessions"` here while lists moved to
  // `"threads"`, so another window never refetched on a new chat).
  const invalidateAllThreadLists = useCallback(() => {
    if (!ai.queryClient) {
      return;
    }
    void ai.queryClient.invalidateQueries({
      queryKey: [...appsAiThreadQueryRoot, "list", ai.serviceBaseUrl],
    });
  }, [ai.queryClient, ai.serviceBaseUrl]);

  const onRealtimeChangeRef = useRef(invalidateAllThreadLists);
  onRealtimeChangeRef.current = invalidateAllThreadLists;

  useEffect(() => {
    const subscription = createEngentyThreadsRealtimeSubscription({
      client: props.realtimeClient ?? null,
      onThreadsChange: () => onRealtimeChangeRef.current(),
      tenantId: props.tenantId,
      userId: props.userId,
    });
    return () => subscription?.unsubscribe();
  }, [props.realtimeClient, props.tenantId, props.userId]);

  useEffect(() => {
    const subscription = createArtifactsRealtimeSubscription({
      client: props.realtimeClient ?? null,
      onArtifactsChange: () => {
        // Always invalidate the whole artifacts root: an UPDATE only carries
        // the NEW scope, so a scope-confined refetch would miss the list the
        // artifact just left (promotion moves thread → task/project). Events
        // are rare enough that the broad invalidation is fine; the
        // version-keyed detail query refetches off the list's current_version.
        void ai.queryClient?.invalidateQueries({
          queryKey: artifactsQueryRoot,
        });
      },
      tenantId: props.tenantId,
    });
    return () => subscription?.unsubscribe();
  }, [props.realtimeClient, props.tenantId, ai.queryClient]);

  const value = useMemo<EngentyThreadsContextValue>(
    () => ({
      activeThreadSpaceId,
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
          spaceId: options?.spaceId,
        }),
      upsertDraftThread,
      userId: props.userId,
    }),
    [
      activeThreadSpaceId,
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
