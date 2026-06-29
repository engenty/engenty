"use client";

import { useCallback, useEffect } from "react";
import {
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
} from "../agent-provider/index.js";
import { clearCopilotPersistedClientStorage } from "../components/presentation.js";
import { useEngentyThreadsContext } from "../threads/engenty-threads-provider.js";
import {
  isTemporaryEngentyThreadId,
  useEngentyThreads,
} from "../threads/use-engenty-threads.js";
import { resolvePendingCopilotThreadNavigate } from "./active-copilot-controller.js";
import { COPILOT_CHAT_NEW } from "./copilot-chat-paths.js";
import {
  clearPendingCopilotUrlThreadState,
  resolvePendingCopilotUrlThreadId,
  setPendingCopilotUrlThreadState,
} from "./copilot-pending-url-thread.js";
import { useCopilotThreadBinding } from "./copilot-thread-binding-provider.js";
import {
  clearAllCopilotLocalRecoveryForUser,
  clearCopilotComposerDraft,
  moveCopilotComposerDraft,
} from "./local-recovery.js";

/** Thread list / drawer / full-page mutations for the main copilot host. */
export function useCopilotThreadActions() {
  const binding = useCopilotThreadBinding();
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const threadsCtx = useEngentyThreadsContext();
  const threads = useEngentyThreads(ENGENTY_COPILOT_HOST_KEY, {
    activeThreadIdOverride: binding.activeThreadId,
  });

  useEffect(() => {
    const pendingThreadId = resolvePendingCopilotUrlThreadId({
      pendingNavigateThreadIdRef: binding.pendingNavigateThreadIdRef,
    });
    const action = resolvePendingCopilotThreadNavigate({
      authoritativeUrlThreadId: binding.authoritativeUrlThreadId,
      hostReady: host.status === "ready",
      isFullPageChatRoute: binding.isFullPageChatRoute,
      pendingThreadId,
      routeThreadId: binding.routeThreadId,
    });
    if (action.type === "wait") {
      return;
    }
    if (action.type === "navigate" && binding.navigate) {
      binding.pendingNavigateThreadIdRef.current = null;
      binding.navigate(binding.resolveSessionPath(action.threadId), {
        replace: true,
      });
      return;
    }
    // Left full-page chat before idle URL sync — keep sessionStorage pending for reload reconcile.
    binding.pendingNavigateThreadIdRef.current = null;
  }, [
    binding.authoritativeUrlThreadId,
    binding.isFullPageChatRoute,
    binding.navigate,
    binding.pendingNavigateThreadIdRef,
    binding.resolveSessionPath,
    binding.routeThreadId,
    host.status,
  ]);

  const selectSession = useCallback(
    (threadId: string) => {
      if (isTemporaryEngentyThreadId(threadId)) {
        if (binding.isFullPageChatRoute) {
          binding.navigate?.(COPILOT_CHAT_NEW);
        }
        return;
      }
      clearPendingCopilotUrlThreadState({
        pendingNavigateThreadIdRef: binding.pendingNavigateThreadIdRef,
      });
      threads.setActiveThreadId(threadId);
      if (binding.isFullPageChatRoute) {
        binding.navigate?.(binding.resolveSessionPath(threadId));
      }
    },
    [
      binding.isFullPageChatRoute,
      binding.navigate,
      binding.resolveSessionPath,
      threads.setActiveThreadId,
    ]
  );

  const deleteSession = useCallback(
    (threadId: string) => {
      if (isTemporaryEngentyThreadId(threadId)) {
        clearCopilotComposerDraft({
          tenantId: binding.tenantId,
          userId: binding.userId,
          threadId,
        });
        binding.bumpNewChatGeneration();
        host.reset();
        return;
      }
      void threads.deleteThread(threadId).then(() => {
        if (binding.activeThreadId !== threadId) {
          return;
        }
        threads.setActiveThreadId(null);
        if (binding.isFullPageChatRoute) {
          binding.navigate?.(COPILOT_CHAT_NEW, { replace: true });
        } else {
          clearPendingCopilotUrlThreadState({
            pendingNavigateThreadIdRef: binding.pendingNavigateThreadIdRef,
          });
          binding.bumpNewChatGeneration();
          host.reset();
        }
      });
    },
    [
      binding.activeThreadId,
      binding.bumpNewChatGeneration,
      binding.isFullPageChatRoute,
      binding.navigate,
      binding.pendingNavigateThreadIdRef,
      binding.tenantId,
      binding.userId,
      host,
      threads,
    ]
  );

  const clearSessions = useCallback(
    () =>
      threads.clearThreads().then(() => {
        threads.setActiveThreadId(null);
        clearAllCopilotLocalRecoveryForUser({
          tenantId: binding.tenantId,
          userId: binding.userId,
        });
        clearCopilotPersistedClientStorage();
        clearPendingCopilotUrlThreadState({
          pendingNavigateThreadIdRef: binding.pendingNavigateThreadIdRef,
        });
        binding.bumpNewChatGeneration();
        host.reset();
        if (binding.isFullPageChatRoute) {
          binding.navigate?.(COPILOT_CHAT_NEW, { replace: true });
        }
      }),
    [
      binding.bumpNewChatGeneration,
      binding.isFullPageChatRoute,
      binding.navigate,
      binding.pendingNavigateThreadIdRef,
      binding.tenantId,
      binding.userId,
      host,
      threads,
    ]
  );

  const startNewChat = useCallback(() => {
    clearPendingCopilotUrlThreadState({
      pendingNavigateThreadIdRef: binding.pendingNavigateThreadIdRef,
    });
    clearCopilotComposerDraft({
      tenantId: binding.tenantId,
      userId: binding.userId,
      threadId:
        threadsCtx.getActiveDraftThreadId(ENGENTY_COPILOT_HOST_KEY) ?? "new",
    });
    threads.setActiveThreadId(null);
    binding.bumpNewChatGeneration();
    host.reset();
    if (binding.isFullPageChatRoute) {
      binding.navigate?.(COPILOT_CHAT_NEW);
    }
  }, [
    binding.bumpNewChatGeneration,
    binding.isFullPageChatRoute,
    binding.navigate,
    binding.pendingNavigateThreadIdRef,
    binding.tenantId,
    binding.userId,
    host,
    threadsCtx,
    threads.setActiveThreadId,
  ]);

  return {
    clearSessions,
    deleteSession,
    isClearingSessions: threads.isClearingThreads,
    isDeletingSession: threads.isDeletingThread,
    selectSession,
    startNewChat,
    threads,
  };
}

/** Called from ActiveCopilotProvider when the server assigns a thread id on first send. */
export function useCopilotOnThreadCreated() {
  const binding = useCopilotThreadBinding();
  const threadsCtx = useEngentyThreadsContext();
  const { getActiveDraftThreadId, removeDraftThread } = threadsCtx;
  const threads = useEngentyThreads(ENGENTY_COPILOT_HOST_KEY, {
    activeThreadIdOverride: binding.activeThreadId,
  });

  return useCallback(
    (threadId: string) => {
      const activeDraftThreadId = getActiveDraftThreadId(
        ENGENTY_COPILOT_HOST_KEY
      );
      if (activeDraftThreadId) {
        moveCopilotComposerDraft({
          fromThreadId: activeDraftThreadId,
          tenantId: binding.tenantId,
          toThreadId: threadId,
          userId: binding.userId,
        });
        removeDraftThread(ENGENTY_COPILOT_HOST_KEY, activeDraftThreadId);
      }
      setPendingCopilotUrlThreadState(
        binding.pendingNavigateThreadIdRef,
        threadId
      );
      threads.setActiveThreadId(threadId);
    },
    [
      binding.pendingNavigateThreadIdRef,
      binding.tenantId,
      binding.userId,
      getActiveDraftThreadId,
      removeDraftThread,
      threads.setActiveThreadId,
    ]
  );
}
