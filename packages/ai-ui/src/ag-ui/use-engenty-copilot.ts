"use client";

/**
 * Headless bring-your-own-UI facade (Enhancing Copilot Ch.4). A thin, CopilotKit-
 * shaped projection of the native `AgentHost` so a hand-rolled chat surface only has
 * to learn four concepts — `{ messages, isRunning, send, stop }` — instead of the full
 * lane API:
 *
 *   function MyChat() {
 *     const { messages, isRunning, send, stop } = useEngentyCopilot();
 *     return (
 *       <Transcript messages={messages} busy={isRunning}>
 *         <Composer onSend={send} onStop={stop} busy={isRunning} />
 *       </Transcript>
 *     );
 *   }
 *
 * It runs entirely through the harness (auth, metering, abort via `stop`) — same
 * guarantees, a CopilotKit-grade surface. Thread binding stays on the `<EngentyAgent>`
 * boundary (the harness owns it): mount `<EngentyAgent threadId=… hostKey=…>` around
 * the surface and this hook reads the bound thread. Pass `hostKey` to project a
 * specific mounted host; omit it to use the nearest boundary.
 */
import { useMemo } from "react";
import { useAgentHost } from "../agent-provider/engenty-agent.js";
import type { AgentHost, EngentyAgentStatus } from "../agent-provider/types.js";

export interface UseEngentyCopilotOptions {
  /** Project a specific mounted host; omit for the nearest `<EngentyAgent>` boundary. */
  hostKey?: string;
}

export interface UseEngentyCopilotResult {
  error: Error | null;
  /** True while a run is in flight (`submitted` or `streaming`). */
  isRunning: boolean;
  /** Normalized transcript turns (user | assistant | reasoning | tool). */
  messages: AgentHost["copilotMessages"];
  /** Submit a user message and start a run. CK `runAgent`/`addMessage` shape. */
  send: (text: string) => void;
  /** Raw lifecycle status, for surfaces that want more than `isRunning`. */
  status: EngentyAgentStatus;
  /** Abort the in-flight run. CK `stopAgent` shape. */
  stop: () => void;
  /** The thread the surrounding `<EngentyAgent>` is bound to (read-only here). */
  threadId: string | null;
}

export function useEngentyCopilot(
  options: UseEngentyCopilotOptions = {}
): UseEngentyCopilotResult {
  const host = useAgentHost(options.hostKey);
  const isRunning = host.status === "submitted" || host.status === "streaming";
  return useMemo(
    () => ({
      error: host.error,
      isRunning,
      messages: host.copilotMessages,
      send: host.submitMessage,
      status: host.status,
      stop: host.cancel,
      threadId: host.threadId,
    }),
    [
      host.error,
      host.copilotMessages,
      host.submitMessage,
      host.cancel,
      host.status,
      host.threadId,
      isRunning,
    ]
  );
}
