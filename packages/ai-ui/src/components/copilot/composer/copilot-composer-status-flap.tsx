"use client";

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import { cn } from "@engenty/ui-core";
import { ChevronUp, MessageSquare } from "lucide-react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
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

/** Text of the last user message — the "what am I waiting on" line shown in
 *  the flap while a run is submitted/streaming with no assistant activity yet. */
export function getLastUserMessageText(
  messages: readonly AgentTurnMessageLike[]
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") {
      continue;
    }
    const record = message as unknown as {
      content?: unknown;
      parts?: readonly unknown[];
    };
    if (typeof record.content === "string" && record.content.trim()) {
      return record.content.trim();
    }
    const text = (record.parts ?? [])
      .map((part) => {
        const typed = part as { text?: unknown; type?: unknown };
        return typed?.type === "text" && typeof typed.text === "string"
          ? typed.text
          : "";
      })
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }
  return "";
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
  /** When the run is idle but the thread already has history, a single-line
   *  preview of the last assistant reply — shown collapsed in place of the
   *  status ticker so compact surfaces signal "there's a conversation here"
   *  and can expand to read it. */
  idlePreviewText?: string | null;
  /** Pending HITL interrupt UI (approval / decision / feedback card). Rendered
   *  always-visible and interactive inside the flap so compact surfaces
   *  (floating launcher, bottom dock) can answer without opening the panel. */
  interruptContent?: ReactNode;
  labels?: AgentStatusTickerLabels;
  messages: readonly AgentTurnMessageLike[];
  /** Absolutely-positioned chrome anchored to the flap (e.g. the peeking blob
   *  avatar) — rendered inside the flap root so it rides the flap's top edge
   *  instead of overlapping its content. */
  overlayAdornment?: ReactNode;
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
  idlePreviewText = null,
  interruptContent = null,
  labels,
  messages,
  overlayAdornment = null,
  replyText,
  runStatus = null,
  stale = false,
}: CopilotComposerStatusFlapProps) {
  const [expanded, setExpanded] = useState(false);
  const dragRef = useRef<{ dragged: boolean; startY: number } | null>(null);

  const canExpand = replyText.length > 0;
  const needsInput =
    runStatus === "waiting_for_input" || runStatus === "waiting_for_approval";
  // Idle history: show the last reply as a 1-line preview instead of the
  // status ticker (which would just read "Done"). Active/error runs keep the
  // ticker so live progress stays visible.
  const showIdlePreview =
    chatStatus === "ready" &&
    !errorMessage &&
    runStatus !== "running" &&
    runStatus !== "queued" &&
    !needsInput &&
    Boolean(idlePreviewText);

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
      {overlayAdornment}
      {showIdlePreview ? (
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-sm">
          <MessageSquare aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{idlePreviewText}</span>
          {canExpand ? (
            <ChevronUp
              aria-hidden
              className={cn(
                "size-3.5 shrink-0 opacity-60 transition-transform duration-200",
                expanded && "rotate-180"
              )}
            />
          ) : null}
        </div>
      ) : (
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
      )}
      {expanded && canExpand ? (
        <div className="mt-1.5 max-h-56 cursor-auto select-text overflow-y-auto border-border/60 border-t pt-1.5 text-muted-foreground text-sm">
          {/* Render markdown (tables, lists, code) the same way the transcript
              does, instead of dumping the raw source as plain text. */}
          <MessageResponse>{replyText}</MessageResponse>
        </div>
      ) : null}
      {interruptContent ? (
        <div
          className="mt-1.5 max-h-80 cursor-auto touch-auto select-auto overflow-y-auto border-border/60 border-t pt-1.5"
          // The flap root toggles expansion on pointer up — keep interactions
          // with the interrupt card (buttons, inputs) from triggering it.
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          {interruptContent}
        </div>
      ) : null}
    </div>
  );
}
