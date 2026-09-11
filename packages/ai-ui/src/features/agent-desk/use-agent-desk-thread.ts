"use client";

import { useMemo } from "react";
import { readAgUiOpenInterrupt } from "../../ag-ui/apps-ai/index.js";
import { useEngentyThread } from "../../threads/use-engenty-thread.js";

/** Server transcript for an Agent Desk lane — undefined until the first fetch settles. */
export function useAgentDeskThread(hostKey: string, threadId: string | null) {
  const thread = useEngentyThread(hostKey, { threadId });

  const initialMessages = useMemo(() => {
    if (!threadId) {
      return;
    }
    if (thread.threadId !== threadId) {
      return;
    }
    if (thread.isLoading || thread.messagesError || thread.isLoadingMessages) {
      return;
    }
    return thread.agUiMessages;
  }, [
    thread.agUiMessages,
    thread.isLoading,
    thread.isLoadingMessages,
    thread.messagesError,
    thread.threadId,
    threadId,
  ]);

  const openInterruptFromSession = useMemo(() => {
    if (!threadId || thread.threadId !== threadId || thread.isLoading) {
      return null;
    }
    return readAgUiOpenInterrupt(thread.session?.metadata ?? null);
  }, [thread.isLoading, thread.session?.metadata, thread.threadId, threadId]);

  return {
    initialMessages,
    isLoadingMessages: Boolean(threadId) && thread.isLoadingMessages,
    olderMessages: thread.olderMessages,
    openInterruptFromSession,
    thread,
  };
}
