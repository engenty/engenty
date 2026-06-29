"use client";

import { useEffect, useRef } from "react";
import { ENGENTY_COPILOT_HOST_KEY } from "../agent-provider/host-keys.js";
import { useAgentHost } from "../agent-provider/index.js";
import { useEngentyThreadsContext } from "../threads/engenty-threads-provider.js";
import { useEngentyThread } from "../threads/use-engenty-thread.js";
import { COPILOT_CHAT_NEW } from "./copilot-chat-paths.js";
import { useCopilotThreadBinding } from "./copilot-thread-binding-provider.js";
import { isCopilotThreadNotFoundError } from "./copilot-thread-not-found.js";

/** Clears stale persisted thread ids when apps/ai returns 404. Requires EngentyAgent boundary. */
export function useCopilotStaleThreadRecovery(activeThreadId: string | null) {
  const binding = useCopilotThreadBinding();
  const threadsCtx = useEngentyThreadsContext();
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const thread = useEngentyThread(ENGENTY_COPILOT_HOST_KEY, {
    threadId: activeThreadId,
  });

  const recoveredStaleThreadRef = useRef<string | null>(null);
  useEffect(() => {
    const staleThreadId = activeThreadId?.trim() ?? "";
    if (!staleThreadId || thread.isLoading || thread.session) {
      return;
    }
    if (!isCopilotThreadNotFoundError(thread.sessionError)) {
      return;
    }
    if (recoveredStaleThreadRef.current === staleThreadId) {
      return;
    }
    recoveredStaleThreadRef.current = staleThreadId;
    threadsCtx.setActiveThreadId(ENGENTY_COPILOT_HOST_KEY, null);
    host.reset();
    if (
      binding.isFullPageChatRoute &&
      binding.authoritativeUrlThreadId === staleThreadId &&
      binding.navigate
    ) {
      binding.navigate(COPILOT_CHAT_NEW, { replace: true });
    }
  }, [
    activeThreadId,
    binding.authoritativeUrlThreadId,
    binding.isFullPageChatRoute,
    binding.navigate,
    host,
    thread.isLoading,
    thread.session,
    thread.sessionError,
    threadsCtx,
  ]);
}

export function CopilotStaleThreadRecovery(props: {
  activeThreadId: string | null;
}) {
  useCopilotStaleThreadRecovery(props.activeThreadId);
  return null;
}
