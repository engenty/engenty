import {
  clearPendingHostMessage,
  ENGENTY_COPILOT_HOST_KEY,
  PendingHostMessageSubmit,
  resolvePendingHostMessage,
  useCopilotSelectedThread,
} from "@engenty/ai-ui";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Bridges a host-generic parked message into full-page Copilot chat.
 *
 * The `/new` URL is replaced only after the exact user turn is present in the
 * created thread, keeping the handoff recoverable through first-send remounts.
 */
export function CopilotHostMessageHandoff() {
  const { binding, isLoadingSelectedSessionMessages } =
    useCopilotSelectedThread();
  const location = useLocation();
  const navigate = useNavigate();
  const message = resolvePendingHostMessage(
    ENGENTY_COPILOT_HOST_KEY,
    location.state
  );
  const consume = useCallback(() => {
    clearPendingHostMessage(ENGENTY_COPILOT_HOST_KEY);
    const threadId = binding.activeThreadId;
    navigate(
      threadId ? binding.resolveSessionPath(threadId) : location.pathname,
      {
        replace: true,
        state: {},
      }
    );
  }, [
    binding.activeThreadId,
    binding.resolveSessionPath,
    location.pathname,
    navigate,
  ]);

  return (
    <PendingHostMessageSubmit
      hostKey={ENGENTY_COPILOT_HOST_KEY}
      isLoadingMessages={isLoadingSelectedSessionMessages}
      message={message}
      onConsumed={consume}
    />
  );
}
