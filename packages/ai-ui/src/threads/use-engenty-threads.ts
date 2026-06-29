"use client";

// CopilotKit-shaped thread list hook — list/rename/delete/clear plus active thread selection per hostKey.
// Respects host profile list mode (many vs single vs none) from resolveEngentyThreadHostProfile.

import { useMutation } from "@engenty/query-client";
import { useCallback, useMemo } from "react";
import type { AppsAiThreadRecord } from "../ag-ui/apps-ai/apps-ai-session-api.js";
import { useAppsAiThreadsQuery } from "../ag-ui/apps-ai/apps-ai-session-api.js";
import { useEngentyThreadsContext } from "./engenty-threads-provider.js";
import { mergeRouteContextWithHostKey } from "./thread-host-key.js";
import { resolveEngentyThreadHostProfile } from "./thread-host-profile.js";

export const TEMPORARY_ENGENTY_THREAD_ID_PREFIX = "tmp:";

function newTemporaryThreadId(): string {
  // Browser-only hook ("use client"); randomUUID keeps draft ids collision-free.
  return `${TEMPORARY_ENGENTY_THREAD_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isTemporaryEngentyThreadId(threadId: string | null): boolean {
  return Boolean(
    threadId?.startsWith(TEMPORARY_ENGENTY_THREAD_ID_PREFIX) &&
      threadId.length > TEMPORARY_ENGENTY_THREAD_ID_PREFIX.length
  );
}

export interface UseEngentyThreadsOptions {
  /** When set, wins over persisted active thread id for this host. */
  activeThreadIdOverride?: string | null;
  agentId?: string | null;
  enabled?: boolean;
  includeArchived?: boolean;
}

export interface CreateEngentyThreadOptions {
  title?: string | null;
}

export interface UseEngentyThreadsResult {
  activeThreadId: string | null;
  archiveThread: (threadId: string) => Promise<void>;
  clearThreads: () => Promise<void>;
  /**
   * CopilotKit `useThreads().createThread` shape — opens a new draft thread,
   * makes it active, and returns its id. The draft is promoted to a durable
   * `ai.agent_session` row on first run (existing draft machinery); nothing is
   * persisted server-side until then.
   */
  createThread: (options?: CreateEngentyThreadOptions) => string;
  deleteThread: (threadId: string) => Promise<void>;
  error: Error | null;
  hasMoreThreads: boolean;
  isClearingThreads: boolean;
  isDeletingThread: boolean;
  isFetchingMore: boolean;
  isLoading: boolean;
  renameThread: (threadId: string, title: string) => Promise<void>;
  setActiveThreadId: (threadId: string | null) => void;
  /** CopilotKit `useThreads().switchThread` shape — alias of `setActiveThreadId`. */
  switchThread: (threadId: string) => void;
  threads: AppsAiThreadRecord[];
  threadsListQueryKey: readonly unknown[];
}

export function useEngentyThreads(
  hostKey: string,
  options: UseEngentyThreadsOptions = {}
): UseEngentyThreadsResult {
  const ctx = useEngentyThreadsContext();
  const profile = useMemo(
    () => resolveEngentyThreadHostProfile(hostKey, options.agentId),
    [hostKey, options.agentId]
  );
  const enabled =
    (options.enabled ?? true) &&
    ctx.isTransportReady &&
    ctx.serviceBaseUrl.length > 0 &&
    profile.listMode === "many";

  const threadsListQueryKey = ctx.threadsListQueryKey(hostKey, {
    includeArchived: options.includeArchived,
  });

  const listQuery = useAppsAiThreadsQuery({
    agentId: profile.agentId,
    enabled,
    hostKey: profile.hostKey,
    includeArchived: options.includeArchived,
    limit: profile.listLimit,
    serviceBaseUrl: ctx.serviceBaseUrl,
  });

  const persistedActive = ctx.getActiveThreadId(hostKey);
  const activeDraftThreadId = ctx.getActiveDraftThreadId(hostKey);
  // Persisted (durable, UUID) active thread wins; otherwise fall back to an active
  // draft. Draft ids are `tmp:` and can't be persisted, so `createThread` relies on
  // this fallback to surface the new thread as active for the bare hook too.
  const activeThreadId =
    options.activeThreadIdOverride === undefined
      ? (persistedActive ?? activeDraftThreadId)
      : (options.activeThreadIdOverride ?? activeDraftThreadId);
  const draftThreads = ctx.getDraftThreads(hostKey);
  const threads = useMemo(() => {
    const serverThreads = listQuery.data ?? [];
    if (draftThreads.length === 0) {
      return serverThreads;
    }
    const draftIds = new Set(draftThreads.map((thread) => thread.id));
    return [
      ...draftThreads,
      ...serverThreads.filter((thread) => !draftIds.has(thread.id)),
    ];
  }, [draftThreads, listQuery.data]);

  const setActiveThreadId = useCallback(
    (threadId: string | null) => {
      ctx.setActiveThreadId(hostKey, threadId);
    },
    [ctx, hostKey]
  );

  const createThread = useCallback(
    (createOptions: CreateEngentyThreadOptions = {}) => {
      const id = newTemporaryThreadId();
      const now = new Date().toISOString();
      ctx.upsertDraftThread(hostKey, {
        agent_id: profile.agentId,
        archived_at: null,
        created_at: now,
        created_by_user_id: ctx.userId,
        id,
        metadata: { draft: true },
        route_context: mergeRouteContextWithHostKey({}, hostKey),
        status: "draft",
        summary: null,
        tenant_id: ctx.tenantId,
        title: createOptions.title ?? null,
        updated_at: now,
        workspace_key: null,
      });
      // `upsertDraftThread` marks the draft active; clear any persisted (durable)
      // active so the new draft wins in `activeThreadId` resolution. The draft id is
      // `tmp:` and cannot itself be persisted via `setActiveThreadId`.
      ctx.setActiveThreadId(hostKey, null);
      return id;
    },
    [ctx, hostKey, profile.agentId]
  );

  const renameMutation = useMutation({
    mutationFn: (input: { threadId: string; title: string }) =>
      ctx.renameThread(hostKey, input.threadId, input.title),
  });
  const archiveMutation = useMutation({
    mutationFn: (threadId: string) => ctx.archiveThread(hostKey, threadId),
  });
  const deleteMutation = useMutation({
    mutationFn: (threadId: string) => ctx.deleteThread(hostKey, threadId),
  });
  const clearMutation = useMutation({
    mutationFn: () => ctx.clearThreads(hostKey),
  });

  return {
    activeThreadId,
    archiveThread: (threadId) => archiveMutation.mutateAsync(threadId),
    clearThreads: () => clearMutation.mutateAsync(),
    createThread,
    deleteThread: (threadId) => deleteMutation.mutateAsync(threadId),
    error: listQuery.error instanceof Error ? listQuery.error : null,
    hasMoreThreads: false,
    isClearingThreads: clearMutation.isPending,
    isDeletingThread: deleteMutation.isPending,
    isFetchingMore: false,
    isLoading: listQuery.isLoading,
    renameThread: (threadId, title) =>
      renameMutation.mutateAsync({ threadId, title }),
    setActiveThreadId,
    switchThread: setActiveThreadId,
    threads,
    threadsListQueryKey,
  };
}
