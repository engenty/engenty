"use client";

// What the blob in the app rail says about the copilot while its window is
// closed. The river keeps running without a surface (the provider is mounted
// at app level), so a reply or a question would otherwise land unseen.
import { useTranslation } from "@engenty/i18n/ui";
import { useEffect, useRef, useState } from "react";
import { agUiMessageText } from "../../../ag-ui/conversation.js";
import { useOptionalAgentHostByKey } from "../../../agent-provider/engenty-agent.js";
import { ENGENTY_COPILOT_HOST_KEY } from "../../../agent-provider/index.js";
import { deriveAgentStatusTicker } from "../composer/agent-status-ticker/derive-agent-status-ticker.js";

export type CopilotRailSignal =
  | { kind: "idle" }
  /** A run streams; `text` is the current step, for the blob's tooltip. */
  | { kind: "working"; text: string }
  /** A decision / approval / feedback card waits for the person. */
  | { kind: "waiting"; text: string }
  /** A run finished while nobody watched; unread until the copilot opens. */
  | { kind: "reply"; text: string };

const IDLE: CopilotRailSignal = { kind: "idle" };

function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? ""
  );
}

function isActiveStatus(status: string | undefined): boolean {
  return status === "submitted" || status === "streaming";
}

/**
 * `visible`: the copilot is on screen (window, sidebar, or its own page).
 * Nothing is signalled then — the person already sees it.
 */
export function useCopilotRailSignal(input: {
  visible: boolean;
}): CopilotRailSignal {
  const host = useOptionalAgentHostByKey(ENGENTY_COPILOT_HOST_KEY);
  const { t } = useTranslation("ai-ui");
  const [unreadReply, setUnreadReply] = useState<string | null>(null);
  const previousStatusRef = useRef(host?.status);

  const status = host?.status;
  const messages = host?.messages;
  const { visible } = input;
  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (visible) {
      setUnreadReply(null);
      return;
    }
    if (isActiveStatus(previous) && status === "ready" && messages) {
      const last = messages.findLast((message) => message.role === "assistant");
      const reply = last ? firstLine(agUiMessageText(last)) : "";
      if (reply) {
        setUnreadReply(reply);
      }
    }
  }, [messages, status, visible]);

  if (!host || visible) {
    return IDLE;
  }
  if (host.awaitingInterrupt) {
    return {
      kind: "waiting",
      text: host.openInterruptFromStream?.title?.trim() ?? "",
    };
  }
  if (isActiveStatus(status)) {
    const ticker = deriveAgentStatusTicker({
      chatStatus: status ?? "ready",
      labels: {
        collapseSteps: t("statusTicker.collapseSteps"),
        done: t("statusTicker.done"),
        error: t("statusTicker.error"),
        expandSteps: t("statusTicker.expandSteps"),
        somethingWentWrong: t("statusTicker.somethingWentWrong"),
        stale: t("statusTicker.stale"),
        thinking: t("statusTicker.thinking"),
        waiting: t("statusTicker.waiting"),
      },
      messages: host.messages,
    });
    return { kind: "working", text: ticker.fullLabel };
  }
  if (unreadReply) {
    return { kind: "reply", text: unreadReply };
  }
  return IDLE;
}
