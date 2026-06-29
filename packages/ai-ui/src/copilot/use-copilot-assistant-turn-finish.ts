"use client";

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import { useEffect, useRef } from "react";
import {
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
} from "../agent-provider/index.js";
import type { CopilotChatOnFinish } from "../components/copilot/session/copilot-chat-types.js";

function lastAssistantMessage(
  messages: readonly { id: string; role: string }[]
): AgentTurnMessageLike | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant") {
      return message as AgentTurnMessageLike;
    }
  }
  return null;
}

/** Notify module copilot contributions when an AG-UI run settles to ready. */
export function useCopilotAssistantTurnFinish(
  onFinish: CopilotChatOnFinish | undefined
) {
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const prevStatusRef = useRef(host.status);

  useEffect(() => {
    const previousStatus = prevStatusRef.current;
    prevStatusRef.current = host.status;
    if (!onFinish) {
      return;
    }
    const wasRunning =
      previousStatus === "streaming" || previousStatus === "submitted";
    if (!wasRunning || host.status !== "ready") {
      return;
    }
    if (host.awaitingInterrupt || host.error) {
      return;
    }
    const message = lastAssistantMessage(host.copilotMessages);
    if (!message) {
      return;
    }
    onFinish({
      isAbort: false,
      isDisconnect: false,
      isError: false,
      message,
      messages: [...host.copilotMessages],
    });
  }, [
    host.awaitingInterrupt,
    host.copilotMessages,
    host.error,
    host.status,
    onFinish,
  ]);
}
