// Copilot transcript — renders AG-UI message parts, tool rows, and thinking shimmer.
"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { isSandboxCommandOpenInterrupt } from "@engenty/ag-ui-bridge";
import { cn } from "@engenty/ui-core";
import {
  memo,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { readChatReferencePart } from "../../../lib/chat-reference-part.js";
import {
  resolveMemoryBreakIndex,
  useThreadMemoryObservationsQuery,
} from "../../../threads/thread-memory-observations.js";
import { useDeveloperModeEnabled } from "../../ag-ui-inspector/ag-ui-inspector-hooks.js";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../../ai-elements/message";
import { Shimmer } from "../../ai-elements/shimmer";
import { formatElapsedSeconds } from "../composer/agent-status-ticker/format-elapsed-seconds.js";
import { useElapsedSeconds } from "../composer/agent-status-ticker/use-elapsed-seconds.js";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import { SandboxCommandConfirmCard } from "../interrupts/sandbox-command-confirm-card";
import type { SubAgentRunSectionLabels } from "../sub-agent-run/sub-agent-run-sections.js";
import { transcriptHasActiveSandboxCommandToolPart } from "../tool-call/sandbox-command-transcript-utils";
import type { ToolCallCardProps } from "../tool-call/tool-call-card.types";
import { ChatAgentsProvider } from "./chat-agent-face.js";
import { useChatStyle } from "./chat-style.js";
import {
  chatUserBubbleClassName,
  softenUserInlineCode,
} from "./chat-user-bubble.js";
import { CopilotAttachmentPreview } from "./copilot-attachment-preview.js";
import { shouldShowCopilotThinkingShimmer } from "./copilot-thinking-shimmer";
import { MentionInlineText } from "./mention-inline-text.js";
import {
  layoutTranscriptRows,
  type TranscriptMessage,
} from "./transcript-layout.js";
import { TranscriptMessageRow } from "./transcript-message-row.js";

export interface CopilotTranscriptProps {
  awaitingInterrupt?: boolean;
  /** Optional wrapper for readable max-width columns (e.g. full-page chat). */
  containerClassName?: string;
  /** `tool_call_id` of a decision/feedback chooser rendered in the docked surface; its inline copy is suppressed. */
  dockedInterruptToolCallId?: string | null;
  messages: readonly TranscriptMessage[];
  openInterrupt?: AgUiOpenInterruptMetadata | null;
  /** Insert index for the pending user bubble while assistant content streams after submit. */
  pendingUserInsertIndex?: number | null;
  /** Optimistic attachment / reference parts while a run is in flight. */
  pendingUserParts?: readonly unknown[] | null;
  /** Optimistic user text while a run is in flight (not duplicated in `messages`). */
  pendingUserText?: string | null;
  /**
   * Sender names on user bubbles. Shared rooms (more than one person can
   * talk) pass true; personal / Copilot chats leave this off.
   */
  showAuthorLabels?: boolean;
  status: "ready" | "streaming" | "submitted" | "error";
  /** Label for sub-agent full-page monitor link (module i18n). */
  subAgentFullViewLabel?: string;
  subAgentSectionLabels?: SubAgentRunSectionLabels;
  /** Full-page chat: card-style bubbles and calmer assistant surface. */
  surface?: "default" | "chat";
  thinkingLabel?: string;
  /** Active thread id — enables sub-agent full-page monitor links. */
  threadId?: string | null;
  /** `compact` tool rows for button / shortcut runs (single line + popover details). */
  toolCardDensity?: ToolCallCardProps["density"];
}

export { shouldShowCopilotThinkingShimmer } from "./copilot-thinking-shimmer";

/** Centered "thinking" row with a live-ticking elapsed-seconds counter. */
function ThinkingShimmerRow({ thinkingLabel }: { thinkingLabel: string }) {
  const elapsedSeconds = useElapsedSeconds(true);
  return (
    <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-sm">
      <Shimmer as="span" duration={2} spread={2}>
        {thinkingLabel}
      </Shimmer>
      <span className="tabular-nums">
        {formatElapsedSeconds(elapsedSeconds)}
      </span>
    </div>
  );
}

const EMPTY_PARTS: readonly unknown[] = [];

/** A transcript longer than this opens with its tail first… */
const TAIL_FIRST_ABOVE_ROWS = 20;
/** …this many rows, the rest drawn right after without moving the view. */
const TAIL_FIRST_ROWS = 15;
/** The newest rows are always drawn in full (see `deferPaint`). */
const ALWAYS_PAINTED_ROWS = 2;

function scrollViewportOf(element: HTMLElement | null): HTMLElement | null {
  return (
    element?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null
  );
}

function isTranscriptRole(msg: TranscriptMessage): boolean {
  return (
    msg.role === "user" || msg.role === "assistant" || msg.role === "system"
  );
}

function shallowEqualRecord(a: object | undefined, b: object | undefined) {
  if (a === b) {
    return true;
  }
  if (!(a && b)) {
    return false;
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  return (
    keys.length === Object.keys(bRecord).length &&
    keys.every(
      (key) => Object.hasOwn(bRecord, key) && aRecord[key] === bRecord[key]
    )
  );
}

function areTranscriptPropsEqual(
  prev: CopilotTranscriptProps,
  next: CopilotTranscriptProps
): boolean {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<
    keyof CopilotTranscriptProps
  >;
  for (const key of keys) {
    // Hosts build the label map inline; equal labels are the same labels.
    const equal =
      key === "subAgentSectionLabels"
        ? shallowEqualRecord(prev[key], next[key])
        : prev[key] === next[key];
    if (!equal) {
      return false;
    }
  }
  return true;
}

/**
 * Memoized: the host re-renders on every composer keystroke, and a
 * transcript whose props did not change has nothing to redraw. Rows are
 * memoized too, so a streaming token redraws the row it lands in.
 */
export const CopilotTranscript = memo(function CopilotTranscript({
  containerClassName,
  messages,
  pendingUserInsertIndex,
  pendingUserParts,
  pendingUserText,
  showAuthorLabels = false,
  status,
  surface = "default",
  threadId = null,
  subAgentFullViewLabel,
  subAgentSectionLabels,
  toolCardDensity = "default",
  thinkingLabel = "Thinking ...",
  awaitingInterrupt = false,
  openInterrupt = null,
  dockedInterruptToolCallId = null,
}: CopilotTranscriptProps) {
  // A person sees what the agent did as clips; the step list is for
  // developers.
  const toolDetail = useDeveloperModeEnabled() ? "developer" : "person";
  const chatStyle = useChatStyle();
  const filteredMessages = useMemo(
    () => messages.filter(isTranscriptRole),
    [messages]
  );
  const pendingText = pendingUserText?.trim() || null;
  const pendingParts = pendingUserParts ?? EMPTY_PARTS;
  const showPending = pendingText != null || pendingParts.length > 0;
  const pendingInsertIndex = showPending
    ? Math.max(
        0,
        Math.min(
          typeof pendingUserInsertIndex === "number" &&
            Number.isFinite(pendingUserInsertIndex)
            ? pendingUserInsertIndex
            : 0,
          filteredMessages.length
        )
      )
    : filteredMessages.length;

  const lastAssistantMessage = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i--) {
      const m = filteredMessages[i];
      if (m?.role === "assistant") {
        return m;
      }
    }
    return null;
  }, [filteredMessages]);
  const lastMessageId = filteredMessages.at(-1)?.id ?? null;

  const showThinkingShimmer = shouldShowCopilotThinkingShimmer({
    awaitingInterrupt,
    // A pending (not yet echoed) user turn sits after it in the transcript.
    lastAssistantIsLastMessage:
      !showPending &&
      lastAssistantMessage !== null &&
      lastMessageId === lastAssistantMessage.id,
    lastAssistantParts: lastAssistantMessage?.parts,
    openInterrupt,
    status,
  });

  const showTrailingSandboxConfirm =
    awaitingInterrupt &&
    openInterrupt &&
    isSandboxCommandOpenInterrupt(openInterrupt) &&
    !transcriptHasActiveSandboxCommandToolPart(
      lastAssistantMessage?.parts,
      openInterrupt
    );

  const memoryQuery = useThreadMemoryObservationsQuery(
    threadId,
    filteredMessages.length
  );
  const memory = memoryQuery.data ?? null;
  const memoryBreakIndex = useMemo(
    () => resolveMemoryBreakIndex(filteredMessages, memory),
    [filteredMessages, memory]
  );

  const rows = useMemo(
    () =>
      layoutTranscriptRows({
        memoryBreakIndex,
        messages: filteredMessages,
        pendingInsertIndex,
        showPending,
        surface,
        toolDetail,
      }),
    [
      filteredMessages,
      memoryBreakIndex,
      pendingInsertIndex,
      showPending,
      surface,
      toolDetail,
    ]
  );

  // The same object while the labels read the same, so rows stay memoized.
  const sectionLabelsRef = useRef(subAgentSectionLabels);
  if (!shallowEqualRecord(sectionLabelsRef.current, subAgentSectionLabels)) {
    sectionLabelsRef.current = subAgentSectionLabels;
  }
  const sectionLabels = sectionLabelsRef.current;

  // A long transcript opens with its tail: the rows a person sees first are
  // drawn first, the rest in a transition right after. The distance to the
  // bottom is kept across that, so the view does not move when the older
  // rows land above it.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drawAll, setDrawAll] = useState(
    () => rows.length <= TAIL_FIRST_ABOVE_ROWS
  );
  const bottomOffsetRef = useRef<number | null>(null);
  useEffect(() => {
    if (drawAll) {
      return;
    }
    const viewport = scrollViewportOf(containerRef.current);
    bottomOffsetRef.current = viewport
      ? viewport.scrollHeight - viewport.scrollTop
      : null;
    startTransition(() => setDrawAll(true));
  }, [drawAll]);
  useLayoutEffect(() => {
    const bottomOffset = bottomOffsetRef.current;
    if (!drawAll || bottomOffset === null) {
      return;
    }
    bottomOffsetRef.current = null;
    const viewport = scrollViewportOf(containerRef.current);
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight - bottomOffset;
    }
  }, [drawAll]);
  const firstDrawnRow = drawAll
    ? 0
    : Math.max(0, rows.length - TAIL_FIRST_ROWS);
  const drawnRows = firstDrawnRow > 0 ? rows.slice(firstDrawnRow) : rows;

  const thread = (
    <ChatAgentsProvider
      // Faces show only beside messenger bubbles.
      enabled={chatStyle === "bubbles" && lastAssistantMessage !== null}
    >
      {drawnRows.map((row, drawnIndex) => {
        if (row.kind === "pending") {
          return (
            <PendingUserMessage
              key="pending-send"
              meetsAbove={row.meetsAbove}
              meetsBelow={row.meetsBelow}
              parts={pendingParts}
              stackClassName={row.stackClassName}
              surface={surface}
              text={pendingText}
            />
          );
        }
        const isLastMessage = row.raw.id === lastMessageId;
        const streaming = status === "streaming" && isLastMessage;
        return (
          <TranscriptMessageRow
            dateDividerClassName={row.dateDividerClassName}
            deferPaint={
              !streaming &&
              firstDrawnRow + drawnIndex < rows.length - ALWAYS_PAINTED_ROWS
            }
            dockedInterruptToolCallId={dockedInterruptToolCallId}
            isLastMessage={isLastMessage}
            key={row.raw.id}
            meetsAbove={row.meetsAbove}
            meetsBelow={row.meetsBelow}
            memory={
              row.memoryDividerClassName !== undefined && memory
                ? memory
                : undefined
            }
            memoryDividerClassName={row.memoryDividerClassName}
            raw={row.raw}
            showAuthorLabels={showAuthorLabels}
            showSenderLabel={row.showSenderLabel}
            stackClassName={row.stackClassName}
            streaming={streaming}
            subAgentFullViewLabel={subAgentFullViewLabel}
            subAgentSectionLabels={sectionLabels}
            surface={surface}
            threadId={threadId}
            toolCardDensity={toolCardDensity}
            toolDetail={toolDetail}
          />
        );
      })}
      {showTrailingSandboxConfirm ? (
        <CopilotTranscriptSandboxInterruptInline open={openInterrupt} />
      ) : null}
      {showThinkingShimmer ? (
        <ThinkingShimmerRow thinkingLabel={thinkingLabel} />
      ) : null}
    </ChatAgentsProvider>
  );

  if (containerClassName?.trim()) {
    return (
      <div
        className={cn(
          "flex min-w-0 flex-col",
          containerClassName.trim(),
          // Lane class carries gap-4 as the default rhythm. Chat clustering
          // owns spacing per row, so consecutive bubbles can sit flush.
          surface === "chat" && "gap-0"
        )}
        ref={containerRef}
      >
        {thread}
      </div>
    );
  }

  return thread;
}, areTranscriptPropsEqual);

function PendingUserMessage(props: {
  meetsAbove: boolean;
  meetsBelow: boolean;
  parts: readonly unknown[];
  stackClassName: string | undefined;
  surface: "default" | "chat";
  text: string | null;
}) {
  const refs = props.parts.flatMap((part) => readChatReferencePart(part) ?? []);
  return (
    <Message
      className={cn(
        "ml-auto",
        props.surface === "chat" && "w-full max-w-full",
        props.stackClassName
      )}
      from="user"
      id="message-pending-send"
    >
      {props.parts.length > 0 ? (
        <CopilotAttachmentPreview parts={props.parts} />
      ) : null}
      {props.text ? (
        <MessageContent
          className={cn(
            props.surface === "chat" &&
              chatUserBubbleClassName({
                meetsAbove: props.meetsAbove,
                meetsBelow: props.meetsBelow,
              })
          )}
        >
          {refs.length > 0 ? (
            <MentionInlineText refs={refs} text={props.text} />
          ) : (
            <MessageResponse>
              {softenUserInlineCode(props.text)}
            </MessageResponse>
          )}
        </MessageContent>
      ) : null}
    </Message>
  );
}

function CopilotTranscriptSandboxInterruptInline(props: {
  open: AgUiOpenInterruptMetadata;
}) {
  const { onSandboxCommandApprove, onSandboxCommandReject } =
    useCopilotToolCallActions();

  return (
    <SandboxCommandConfirmCard
      onApprove={() => onSandboxCommandApprove?.(props.open)}
      onReject={() => onSandboxCommandReject?.(props.open)}
      open={props.open}
    />
  );
}
