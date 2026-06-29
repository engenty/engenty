"use client";

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import { cn } from "@engenty/ui-core";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { MessageResponse } from "../../ai-elements/message.js";
import { AgentStatusTicker } from "./agent-status-ticker/agent-status-ticker.js";
import { getLastAssistantMessage } from "./agent-status-ticker/derive-agent-status-ticker.js";
import type {
  AgentRunStatus,
  AgentStatusTickerLabels,
} from "./agent-status-ticker/types.js";

/** Keeps the element mounted while it plays its exit transition. */
export function useAnimatedPresence(visible: boolean, exitMs = 220) {
  const [rendered, setRendered] = useState(visible);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (visible) {
      setRendered(true);
      setClosing(false);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [visible, exitMs]);
  return { closing, rendered };
}

/** Concatenated text parts of the last assistant message — empty when the
 *  run only executed commands/tools (no content reply). */
export function getAssistantReplyText(
  messages: readonly AgentTurnMessageLike[]
): string {
  const parts = getLastAssistantMessage(messages)?.parts ?? [];
  return parts
    .map((part) => {
      const typed = part as { text?: unknown; type?: unknown };
      return typed?.type === "text" && typeof typed.text === "string"
        ? typed.text
        : "";
    })
    .join("")
    .trim();
}

const DRAG_EXPAND_THRESHOLD = 14;

export interface CopilotComposerStatusFlapProps {
  activityBaselineSignature?: string | null;
  /** When false the flap will not auto-expand after a run completes.
   *  Set to false when the reply is already visible in an attached thread. */
  autoExpand?: boolean;
  chatStatus: "ready" | "streaming" | "submitted" | "error";
  closing: boolean;
  errorMessage?: string | null;
  labels?: AgentStatusTickerLabels;
  messages: readonly AgentTurnMessageLike[];
  replyText: string;
  runStatus?: AgentRunStatus | null;
  stale?: boolean;
}

/** Status flap behind the composer card: slides in/out, stays after a run,
 *  and expands upward (click or drag) to reveal the reply content. */
export function CopilotComposerStatusFlap({
  activityBaselineSignature,
  autoExpand = true,
  chatStatus,
  closing,
  errorMessage = null,
  labels,
  messages,
  replyText,
  runStatus = null,
  stale = false,
}: CopilotComposerStatusFlapProps) {
  const [expanded, setExpanded] = useState(false);
  const dragRef = useRef<{ dragged: boolean; startY: number } | null>(null);

  const canExpand = replyText.length > 0;
  const needsInput =
    runStatus === "waiting_for_input" || runStatus === "waiting_for_approval";

  // New run: collapse. Run finished with a content reply, or the agent is
  // waiting on the user: auto-expand so the message isn't missed.
  // When autoExpand=false (e.g. full chat where the reply is already visible
  // in the thread above), skip the auto-expand so it doesn't double-show.
  const prevChatStatusRef = useRef(chatStatus);
  useEffect(() => {
    const prev = prevChatStatusRef.current;
    prevChatStatusRef.current = chatStatus;
    if (chatStatus === "submitted") {
      setExpanded(false);
      return;
    }
    if (autoExpand && chatStatus === "ready" && prev !== "ready" && canExpand) {
      setExpanded(true);
    }
  }, [autoExpand, chatStatus, canExpand]);
  useEffect(() => {
    if (autoExpand && needsInput && canExpand) {
      setExpanded(true);
    }
  }, [autoExpand, needsInput, canExpand]);
  const toggle = () => canExpand && setExpanded((current) => !current);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { dragged: false, startY: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!(drag && canExpand)) {
      return;
    }
    const dy = event.clientY - drag.startY;
    if (dy < -DRAG_EXPAND_THRESHOLD && !expanded) {
      drag.dragged = true;
      setExpanded(true);
    } else if (dy > DRAG_EXPAND_THRESHOLD && expanded) {
      drag.dragged = true;
      setExpanded(false);
    }
  };
  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.dragged) {
      toggle();
    }
  };

  return (
    <div
      aria-live="polite"
      className={cn(
        "absolute inset-x-0 bottom-[calc(100%-1.25rem)] z-0 rounded-t-xl border border-border border-b-0 bg-card px-3 pt-2 pb-7 transition-[opacity,translate] duration-200 ease-out",
        canExpand && "cursor-pointer touch-none select-none",
        closing
          ? "translate-y-3 opacity-0"
          : "motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 translate-y-0 opacity-100 motion-safe:animate-in motion-safe:duration-200"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="status"
    >
      <AgentStatusTicker
        activityBaselineSignature={activityBaselineSignature}
        chatStatus={chatStatus}
        className="w-full min-w-0"
        enableShimmer
        errorMessage={errorMessage}
        labels={labels}
        messages={messages}
        runStatus={runStatus}
        stale={stale}
        statusOnly
      />
      {expanded && canExpand ? (
        <div className="mt-1.5 max-h-56 cursor-auto select-text overflow-y-auto border-border/60 border-t pt-1.5 text-muted-foreground text-sm">
          {/* Render markdown (tables, lists, code) the same way the transcript
              does, instead of dumping the raw source as plain text. */}
          <MessageResponse>{replyText}</MessageResponse>
        </div>
      ) : null}
    </div>
  );
}
