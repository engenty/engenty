"use client";

import { useMemo } from "react";
import { readAgUiOpenInterrupt } from "../ag-ui/apps-ai/index.js";
import { ENGENTY_COPILOT_HOST_KEY } from "../agent-provider/host-keys.js";
import { useEngentyThread } from "../threads/use-engenty-thread.js";

/** Server transcript for EngentyAgent hydrate — undefined until first fetch settles. */
export function useCopilotInitialMessages(activeThreadId: string | null) {
  const thread = useEngentyThread(ENGENTY_COPILOT_HOST_KEY, {
    threadId: activeThreadId,
  });

  const initialMessages = useMemo(() => {
    if (!activeThreadId) {
      return;
    }
    if (thread.threadId !== activeThreadId) {
      return;
    }
    if (thread.isLoading || thread.messagesError || thread.isLoadingMessages) {
      return;
    }
    return thread.agUiMessages;
  }, [
    activeThreadId,
    thread.agUiMessages,
    thread.isLoading,
    thread.isLoadingMessages,
    thread.messagesError,
    thread.threadId,
  ]);

  const openInterruptFromSession = useMemo(() => {
    if (!activeThreadId || thread.threadId !== activeThreadId) {
      return null;
    }
    if (thread.isLoading) {
      return null;
    }
    return readAgUiOpenInterrupt(thread.session?.metadata ?? null);
  }, [
    activeThreadId,
    thread.isLoading,
    thread.session?.metadata,
    thread.threadId,
  ]);

  return {
    initialMessages,
    openInterruptFromSession,
    thread,
    threadDetailQueryKey: thread.threadDetailQueryKey,
    threadMessagesQueryKey: thread.threadMessagesQueryKey,
  };
}
