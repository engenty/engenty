"use client";

import { useEffect, useRef } from "react";
import { useAgentHost, useEngentyAIContext } from "../agent-provider/index.js";
import {
  decidePendingHostMessageSubmit,
  pendingHostMessageDelivered,
} from "./host-message-delivery.js";
import { readPendingHostMessage } from "./host-message-handoff.js";

function noopPendingConsumed() {}

/** Auto-send a parked message once its destination host can submit. */
export function PendingHostMessageSubmit({
  hostKey,
  isLoadingMessages,
  message,
  onConsumed,
}: {
  hostKey: string;
  isLoadingMessages: boolean;
  message: string | null;
  onConsumed?: () => void;
}) {
  const host = useAgentHost(hostKey);
  const { isTransportReady } = useEngentyAIContext();
  const kicked = useRef(false);
  const consumed = useRef(false);
  const pendingSend = host.pendingSend?.text ?? null;
  const consume = onConsumed ?? noopPendingConsumed;

  useEffect(() => {
    if (consumed.current) {
      return;
    }
    const parkedText = message ?? readPendingHostMessage(hostKey);
    const decision = decidePendingHostMessageSubmit({
      delivered:
        Boolean(host.activeThreadId) &&
        pendingHostMessageDelivered(parkedText, host.copilotMessages),
      isLoadingMessages,
      isTransportReady,
      kicked: kicked.current,
      parkedText,
      pendingSendText: pendingSend,
      status: host.status,
    });
    if (decision.type === "submit") {
      kicked.current = true;
      host.submitMessage(decision.text);
      return;
    }
    if (decision.type === "complete") {
      consumed.current = true;
      consume();
    }
  }, [
    consume,
    host.activeThreadId,
    host.copilotMessages,
    host.status,
    host.submitMessage,
    hostKey,
    isLoadingMessages,
    isTransportReady,
    message,
    pendingSend,
  ]);

  return null;
}
