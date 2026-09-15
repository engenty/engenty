"use client";

import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { logCopilotChatNew } from "../ag-ui/chat-new-debug.js";
import {
  ACTIVE_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_HOST_KEY,
} from "../agent-provider/host-keys.js";
import { useEngentyThreadsContext } from "../threads/engenty-threads-provider.js";
import { TEMPORARY_ENGENTY_THREAD_ID_PREFIX } from "../threads/use-engenty-threads.js";
import {
  bumpActiveCopilotNewChatGeneration,
  readActiveCopilotNewChatGeneration,
  resolveActiveCopilotHostThreadId,
  resolveActiveCopilotStableSessionKey,
  shouldPersistCopilotUrlThreadToLastActive,
  shouldReconcileCopilotStaleSessionUrl,
} from "./active-copilot-controller.js";
import { defaultCopilotSessionPath } from "./copilot-chat-paths.js";
import {
  clearPendingCopilotUrlThreadState,
  readPendingCopilotUrlThreadId,
  resolvePendingCopilotUrlThreadId,
} from "./copilot-pending-url-thread.js";

export interface CopilotThreadBindingProviderProps {
  children: ReactNode;
  isChatIndexRoute: boolean;
  isFullPageChatRoute: boolean;
  isNewChatRoute: boolean;
  navigate?: (path: string, options?: { replace?: boolean }) => void;
  pathname: string;
  resolveSessionPath?: (threadId: string) => string;
  routeThreadId: string | null;
  tenantId: string;
  userId: string;
}

export interface CopilotThreadBindingContextValue {
  activeThreadId: string | null;
  authoritativeUrlThreadId: string | null;
  bumpNewChatGeneration: () => void;
  isChatIndexRoute: boolean;
  isFullPageChatRoute: boolean;
  isNewChatRoute: boolean;
  navigate?: (path: string, options?: { replace?: boolean }) => void;
  newChatGeneration: string;
  pathname: string;
  /** Set when first send on `/new` yields a server thread id (idle navigate). */
  pendingNavigateThreadIdRef: MutableRefObject<string | null>;
  resolveSessionPath: (threadId: string) => string;
  routeThreadId: string | null;
  stableSessionKey: string | null;
  tenantId: string;
  userId: string;
}

const CopilotThreadBindingContext =
  createContext<CopilotThreadBindingContextValue | null>(null);

export function CopilotThreadBindingProvider(
  props: CopilotThreadBindingProviderProps
) {
  const {
    children,
    isChatIndexRoute,
    isFullPageChatRoute,
    isNewChatRoute,
    navigate,
    pathname,
    resolveSessionPath = defaultCopilotSessionPath,
    routeThreadId,
    tenantId,
    userId,
  } = props;

  const threadsCtx = useEngentyThreadsContext();
  const { removeDraftThread, upsertDraftThread } = threadsCtx;
  const persistedLastActive = threadsCtx.getActiveThreadId(
    ENGENTY_COPILOT_HOST_KEY
  );

  const [newChatGeneration, setNewChatGeneration] = useState(() =>
    readActiveCopilotNewChatGeneration()
  );
  const prevNewChatRouteRef = useRef(isNewChatRoute);
  useEffect(() => {
    const wasNew = prevNewChatRouteRef.current;
    prevNewChatRouteRef.current = isNewChatRoute;
    if (isNewChatRoute && !wasNew) {
      setNewChatGeneration(bumpActiveCopilotNewChatGeneration());
    }
  }, [isNewChatRoute]);

  const bumpNewChatGeneration = useCallback(() => {
    setNewChatGeneration(bumpActiveCopilotNewChatGeneration());
  }, []);

  const { authoritativeUrlThreadId, activeThreadId } = useMemo(
    () =>
      resolveActiveCopilotHostThreadId({
        isChatIndexRoute,
        isFullPageChatRoute,
        isNewChatRoute,
        lastActiveThreadId: persistedLastActive,
        pathname,
      }),
    [
      isChatIndexRoute,
      isFullPageChatRoute,
      isNewChatRoute,
      persistedLastActive,
      pathname,
    ]
  );

  const pendingNavigateThreadIdRef = useRef<string | null>(
    readPendingCopilotUrlThreadId()
  );

  useEffect(() => {
    const pendingUrlThreadId = resolvePendingCopilotUrlThreadId({
      pendingNavigateThreadIdRef,
    });
    if (
      shouldReconcileCopilotStaleSessionUrl({
        authoritativeUrlThreadId,
        isFullPageChatRoute,
        pendingUrlThreadId,
        persistedLastActive,
      }) &&
      navigate &&
      persistedLastActive
    ) {
      navigate(resolveSessionPath(persistedLastActive), { replace: true });
    }
  }, [
    authoritativeUrlThreadId,
    isFullPageChatRoute,
    navigate,
    persistedLastActive,
    resolveSessionPath,
  ]);

  useEffect(() => {
    const pendingUrlThreadId = resolvePendingCopilotUrlThreadId({
      pendingNavigateThreadIdRef,
    });
    if (pendingUrlThreadId && authoritativeUrlThreadId === pendingUrlThreadId) {
      clearPendingCopilotUrlThreadState({ pendingNavigateThreadIdRef });
    }
  }, [authoritativeUrlThreadId]);

  useEffect(() => {
    const pendingUrlThreadId = resolvePendingCopilotUrlThreadId({
      pendingNavigateThreadIdRef,
    });
    if (
      !shouldPersistCopilotUrlThreadToLastActive({
        authoritativeUrlThreadId,
        pendingUrlThreadId,
        persistedLastActive,
      })
    ) {
      return;
    }
    if (authoritativeUrlThreadId) {
      threadsCtx.setActiveThreadId(
        ENGENTY_COPILOT_HOST_KEY,
        authoritativeUrlThreadId
      );
    }
  }, [authoritativeUrlThreadId, persistedLastActive, threadsCtx]);

  const stableSessionKey = useMemo(() => {
    if (activeThreadId) {
      return null;
    }
    return resolveActiveCopilotStableSessionKey({
      agentId: ACTIVE_COPILOT_AGENT_ID,
      newChatGeneration,
      tenantId,
      userId,
    });
  }, [activeThreadId, newChatGeneration, tenantId, userId]);

  const draftThreadId = `${TEMPORARY_ENGENTY_THREAD_ID_PREFIX}${newChatGeneration}`;
  useEffect(() => {
    if (!(isFullPageChatRoute && isNewChatRoute)) {
      removeDraftThread(ENGENTY_COPILOT_HOST_KEY, draftThreadId);
      return;
    }
    const now = new Date().toISOString();
    upsertDraftThread(ENGENTY_COPILOT_HOST_KEY, {
      agent_id: ACTIVE_COPILOT_AGENT_ID,
      archived_at: null,
      created_at: now,
      created_by_user_id: userId,
      id: draftThreadId,
      metadata: { draft: true },
      // A draft is not filed anywhere yet: the space is written when the first
      // run persists the row, from `route_context.scope.space_id`.
      space_id: null,
      route_context: {
        moduleId: "engenty-copilot",
        pathname,
        routeKey: "chat",
      },
      status: "draft",
      summary: null,
      tenant_id: tenantId,
      title: null,
      updated_at: now,
      workspace_key: null,
    });
    return () => {
      removeDraftThread(ENGENTY_COPILOT_HOST_KEY, draftThreadId);
    };
  }, [
    draftThreadId,
    isFullPageChatRoute,
    isNewChatRoute,
    pathname,
    removeDraftThread,
    tenantId,
    upsertDraftThread,
    userId,
  ]);

  useEffect(() => {
    logCopilotChatNew("active binding", {
      authoritativeUrlThreadId,
      activeThreadId,
      isNewChatRoute,
      pathname,
      routeThreadId,
    });
  }, [
    authoritativeUrlThreadId,
    activeThreadId,
    isNewChatRoute,
    pathname,
    routeThreadId,
  ]);

  const value = useMemo<CopilotThreadBindingContextValue>(
    () => ({
      activeThreadId,
      authoritativeUrlThreadId,
      bumpNewChatGeneration,
      isChatIndexRoute,
      isFullPageChatRoute,
      isNewChatRoute,
      navigate,
      newChatGeneration,
      pendingNavigateThreadIdRef,
      pathname,
      resolveSessionPath,
      routeThreadId,
      stableSessionKey,
      tenantId,
      userId,
    }),
    [
      activeThreadId,
      authoritativeUrlThreadId,
      bumpNewChatGeneration,
      isChatIndexRoute,
      isFullPageChatRoute,
      isNewChatRoute,
      navigate,
      newChatGeneration,
      pathname,
      resolveSessionPath,
      routeThreadId,
      stableSessionKey,
      tenantId,
      userId,
    ]
  );

  return (
    <CopilotThreadBindingContext.Provider value={value}>
      {children}
    </CopilotThreadBindingContext.Provider>
  );
}

export function useOptionalCopilotThreadBinding(): CopilotThreadBindingContextValue | null {
  return useContext(CopilotThreadBindingContext);
}

export function useCopilotThreadBinding(): CopilotThreadBindingContextValue {
  const context = useOptionalCopilotThreadBinding();
  if (!context) {
    throw new Error(
      "useCopilotThreadBinding must be used inside <CopilotThreadBindingProvider>"
    );
  }
  return context;
}
