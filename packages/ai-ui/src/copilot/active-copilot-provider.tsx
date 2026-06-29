"use client";

import { type ReactNode, useEffect } from "react";
import { logCopilotChatNew } from "../ag-ui/chat-new-debug.js";
import {
  ACTIVE_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_HOST_KEY,
  EngentyAgent,
} from "../agent-provider/index.js";
import type { CopilotRouteContext } from "../components/presentation.js";
import { useEngentyThreads } from "../threads/index.js";
import { defaultCopilotSessionPath } from "./copilot-chat-paths.js";
import {
  CopilotThreadBindingProvider,
  useCopilotThreadBinding,
} from "./copilot-thread-binding-provider.js";
import { CopilotVoiceProvider } from "./copilot-voice-provider.js";
import { useCopilotInitialMessages } from "./use-copilot-initial-messages.js";
import { CopilotStaleThreadRecovery } from "./use-copilot-stale-thread-recovery.js";
import { useCopilotOnThreadCreated } from "./use-copilot-thread-actions.js";

export interface ActiveCopilotProviderProps {
  children: ReactNode;
  isChatIndexRoute: boolean;
  isFullPageChatRoute: boolean;
  isNewChatRoute: boolean;
  navigate?: (path: string, options?: { replace?: boolean }) => void;
  pathname: string;
  resolveSessionPath?: (threadId: string) => string;
  routeContext: CopilotRouteContext;
  routeThreadId: string | null;
  serviceBaseUrl: string;
  tenantId: string;
  userId: string;
}

function ActiveCopilotAgentMount(props: {
  children: ReactNode;
  pathname: string;
  routeContext: CopilotRouteContext;
}) {
  const binding = useCopilotThreadBinding();
  const copilotThreads = useEngentyThreads(ENGENTY_COPILOT_HOST_KEY, {
    activeThreadIdOverride: binding.activeThreadId,
  });
  const {
    initialMessages,
    openInterruptFromSession,
    threadDetailQueryKey,
    threadMessagesQueryKey,
  } = useCopilotInitialMessages(binding.activeThreadId);
  const onThreadCreated = useCopilotOnThreadCreated();

  useEffect(() => {
    logCopilotChatNew("active messages hydrate", {
      activeThreadId: binding.activeThreadId,
      initialMessagesLen: initialMessages?.length ?? null,
    });
  }, [binding.activeThreadId, initialMessages?.length]);

  return (
    <EngentyAgent
      agentId={ACTIVE_COPILOT_AGENT_ID}
      authoritativeUrlThreadId={binding.authoritativeUrlThreadId}
      hostKey={ENGENTY_COPILOT_HOST_KEY}
      hydrateEnabled
      initialMessages={initialMessages}
      messagesQueryKey={threadMessagesQueryKey}
      onThreadCreated={(threadId) => {
        logCopilotChatNew("active provider onThreadCreated", { threadId });
        onThreadCreated(threadId);
      }}
      openInterruptFromSession={openInterruptFromSession}
      pathname={props.pathname}
      routeContext={props.routeContext}
      stableSessionKey={binding.stableSessionKey}
      threadDetailQueryKey={threadDetailQueryKey}
      threadId={binding.activeThreadId}
      threadsListQueryKey={copilotThreads.threadsListQueryKey}
    >
      <CopilotStaleThreadRecovery activeThreadId={binding.activeThreadId} />
      <CopilotVoiceProvider>{props.children}</CopilotVoiceProvider>
    </EngentyAgent>
  );
}

export function ActiveCopilotProvider(props: ActiveCopilotProviderProps) {
  const {
    children,
    isChatIndexRoute,
    isFullPageChatRoute,
    isNewChatRoute,
    navigate,
    pathname,
    resolveSessionPath = defaultCopilotSessionPath,
    routeContext,
    routeThreadId,
    tenantId,
    userId,
  } = props;

  return (
    <CopilotThreadBindingProvider
      isChatIndexRoute={isChatIndexRoute}
      isFullPageChatRoute={isFullPageChatRoute}
      isNewChatRoute={isNewChatRoute}
      navigate={navigate}
      pathname={pathname}
      resolveSessionPath={resolveSessionPath}
      routeThreadId={routeThreadId}
      tenantId={tenantId}
      userId={userId}
    >
      <ActiveCopilotAgentMount pathname={pathname} routeContext={routeContext}>
        {children}
      </ActiveCopilotAgentMount>
    </CopilotThreadBindingProvider>
  );
}
