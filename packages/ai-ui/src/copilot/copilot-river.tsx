"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
// The river: one person, their copilot, one conversation.
//
// The copilot follows the person through the app, so its thread is a fact
// about the person, not about a page — one per user per tenant, opened on
// first use with a stable id the server derives (`POST /ai/threads/dm` with
// no space: the copilot's DM, the same row on every call). Nothing here reads
// the URL for a thread id, remembers one per space, drafts one, recovers one,
// or navigates to one. There is nothing to choose.
//
// Where a turn happens still matters — it is stamped on the message
// (apps/ai turn-context.ts) and cuts the river into chapters — and that is the
// route context this provider hands the host, exactly as before.
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ACTIVE_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_HOST_KEY,
  EngentyAgent,
} from "../agent-provider/index.js";
import type { CopilotRouteContext } from "../components/presentation.js";
import { requestAiServiceJson } from "../lib/runtime/ai-service-client.js";
import { useEngentyThreadsContext } from "../threads/engenty-threads-provider.js";
import { useEngentyThreads } from "../threads/index.js";
import { startThreadTranscriptStore } from "../threads/thread-transcript-store.js";
import { CopilotVoiceProvider } from "./copilot-voice-provider.js";
import { useCopilotInitialMessages } from "./use-copilot-initial-messages.js";

export interface CopilotRiverContextValue {
  isPending: boolean;
  navigate?: (path: string, options?: { replace?: boolean }) => void;
  pathname: string;
  tenantId: string;
  /** The one thread between this person and the copilot. Null until opened. */
  threadId: string | null;
  userId: string;
}

const CopilotRiverContext = createContext<CopilotRiverContextValue | null>(
  null
);

/** The river when mounted under its provider, else null (a pane on a desk). */
export function useOptionalCopilotRiver(): CopilotRiverContextValue | null {
  return useContext(CopilotRiverContext);
}

export function useCopilotRiver(): CopilotRiverContextValue {
  const ctx = useContext(CopilotRiverContext);
  if (!ctx) {
    throw new Error("useCopilotRiver must be used within CopilotRiverProvider");
  }
  return ctx;
}

/** The river's id for this person: get-or-create, idempotent, same id each time. */
export async function openCopilotRiver(uiLanguage?: string): Promise<string> {
  const result = await requestAiServiceJson<{ session: { id: string } }>(
    "/ai/threads/dm",
    {
      body: JSON.stringify({
        agent_id: ACTIVE_COPILOT_AGENT_ID,
        // The first open writes the copilot's welcome in this language
        // (a BCP 47 tag; the server translates the welcome into it).
        ...(uiLanguage ? { ui_language: uiLanguage } : {}),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
  return result.session.id;
}

// The river's id is stable per person, so the last one opened is remembered:
// the transcript starts loading on mount instead of after the get-or-create
// round trip, which still runs and wins if the id ever differs.
function riverIdStorageKey(tenantId: string, userId: string): string {
  return `engenty:copilot-river:${tenantId}:${userId}`;
}

function readRememberedRiverId(tenantId: string, userId: string) {
  try {
    return localStorage.getItem(riverIdStorageKey(tenantId, userId));
  } catch {
    return null;
  }
}

function rememberRiverId(tenantId: string, userId: string, id: string) {
  try {
    localStorage.setItem(riverIdStorageKey(tenantId, userId), id);
  } catch {
    // Storage blocked: the river still opens, just one round trip later.
  }
}

export interface CopilotRiverProviderProps {
  children: ReactNode;
  navigate?: (path: string, options?: { replace?: boolean }) => void;
  pathname: string;
  routeContext: CopilotRouteContext;
  tenantId: string;
  userId: string;
}

function CopilotRiverAgentMount(props: {
  children: ReactNode;
  pathname: string;
  routeContext: CopilotRouteContext;
  threadId: string | null;
}) {
  const copilotThreads = useEngentyThreads(ENGENTY_COPILOT_HOST_KEY, {
    activeThreadIdOverride: props.threadId,
  });
  const {
    initialMessages,
    openInterruptFromSession,
    threadDetailQueryKey,
    threadMessagesQueryKey,
  } = useCopilotInitialMessages(props.threadId);

  return (
    <EngentyAgent
      agentId={ACTIVE_COPILOT_AGENT_ID}
      hostKey={ENGENTY_COPILOT_HOST_KEY}
      hydrateEnabled
      initialMessages={initialMessages}
      messagesQueryKey={threadMessagesQueryKey}
      openInterruptFromSession={openInterruptFromSession}
      pathname={props.pathname}
      routeContext={props.routeContext}
      threadDetailQueryKey={threadDetailQueryKey}
      threadId={props.threadId}
      threadsListQueryKey={copilotThreads.threadsListQueryKey}
    >
      <CopilotVoiceProvider>{props.children}</CopilotVoiceProvider>
    </EngentyAgent>
  );
}

export function CopilotRiverProvider(props: CopilotRiverProviderProps) {
  const { children, navigate, pathname, routeContext, tenantId, userId } =
    props;
  const threadsCtx = useEngentyThreadsContext();
  const queryClient = useQueryClient();
  // Recent transcripts from this browser, for this person: mounted here
  // because the river is the one provider that lives as long as the session.
  useEffect(() => {
    if (!(tenantId && userId)) {
      return;
    }
    return startThreadTranscriptStore(queryClient, `${tenantId}|${userId}`);
  }, [queryClient, tenantId, userId]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(true);
  const { i18n } = useTranslation();
  // Read at open time only; the river never reopens when the language changes.
  const uiLanguageRef = useRef(i18n.resolvedLanguage ?? i18n.language);
  uiLanguageRef.current = i18n.resolvedLanguage ?? i18n.language;

  useEffect(() => {
    if (!(tenantId && userId)) {
      return;
    }
    let cancelled = false;
    const remembered = readRememberedRiverId(tenantId, userId);
    if (remembered) {
      setThreadId(remembered);
      threadsCtx.setActiveThreadId(ENGENTY_COPILOT_HOST_KEY, remembered);
      setIsPending(false);
    } else {
      setIsPending(true);
    }
    openCopilotRiver(uiLanguageRef.current)
      .then((id) => {
        if (cancelled) {
          return;
        }
        rememberRiverId(tenantId, userId, id);
        setThreadId(id);
        // The rest of the copilot chrome still asks the threads provider which
        // thread is active; the answer is always this one.
        threadsCtx.setActiveThreadId(ENGENTY_COPILOT_HOST_KEY, id);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("[copilot] opening the river failed:", error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPending(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // The provider is keyed on who, never on where: the river does not change
    // when the page does.
  }, [tenantId, userId, threadsCtx.setActiveThreadId]);

  const value = useMemo<CopilotRiverContextValue>(
    () => ({ isPending, navigate, pathname, tenantId, threadId, userId }),
    [isPending, navigate, pathname, tenantId, threadId, userId]
  );

  return (
    <CopilotRiverContext.Provider value={value}>
      <CopilotRiverAgentMount
        pathname={pathname}
        routeContext={routeContext}
        threadId={threadId}
      >
        {children}
      </CopilotRiverAgentMount>
    </CopilotRiverContext.Provider>
  );
}
