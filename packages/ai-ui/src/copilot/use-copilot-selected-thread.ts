"use client";

import { useMemo } from "react";
import { isAwaitingAgUiInitialHydrate } from "../ag-ui/conversation.js";
import { useEngentyAIContext } from "../agent-provider/engenty-ai-provider.js";
import {
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
} from "../agent-provider/index.js";
import { isThreadWritableByViewer } from "../threads/thread-write-access.js";
import { useCopilotThreadBinding } from "./copilot-thread-binding-provider.js";
import { isCopilotThreadNotFoundError } from "./copilot-thread-not-found.js";
import { useCopilotInitialMessages } from "./use-copilot-initial-messages.js";

/** Selected-thread loading, 404, and hydrate state for full-page chat surfaces. */
export function useCopilotSelectedThread() {
  const binding = useCopilotThreadBinding();
  const ai = useEngentyAIContext();
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const { initialMessages, openInterruptFromSession, thread } =
    useCopilotInitialMessages(binding.activeThreadId);

  const isSelectedSessionNotFound =
    Boolean(binding.activeThreadId) &&
    !thread.isLoading &&
    !thread.session &&
    isCopilotThreadNotFoundError(thread.sessionError);

  const selectedSessionMessagesError = thread.messagesError;

  const isAwaitingInitialHydrate = isAwaitingAgUiInitialHydrate({
    currentMessages: host.messages,
    initialMessages,
    suppressHydration: host.status !== "ready",
  });

  const isLoadingSelectedSessionMessages =
    (Boolean(binding.activeThreadId) &&
      ai.isTransportReady &&
      thread.isLoadingMessages) ||
    isAwaitingInitialHydrate;

  /**
   * Surfaces that can open somebody else's thread — a task's agent thread is
   * reachable from the task page — swap the composer out rather than offer an
   * input the server would reject on every send.
   */
  const isReadOnlyThread = !isThreadWritableByViewer(
    thread.session,
    binding.userId
  );

  const status = useMemo(
    () =>
      host.pendingSend && host.status === "ready"
        ? ("submitted" as const)
        : host.status,
    [host.pendingSend, host.status]
  );

  return {
    binding,
    host,
    initialMessages,
    isLoadingSelectedSessionMessages,
    isReadOnlyThread,
    isSelectedSessionNotFound,
    isTransportReady: ai.isTransportReady,
    openInterruptFromSession,
    selectedSessionMessagesError,
    serviceBaseUrl: ai.serviceBaseUrl,
    status,
    tenantId: binding.tenantId,
    thread,
    userId: binding.userId,
  };
}
