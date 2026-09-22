// Copilot transcript — renders AG-UI message parts, tool rows, and thinking shimmer.
"use client";

import type {
  AgentTurnMessageLike,
  AgUiOpenInterruptMetadata,
} from "@engenty/ag-ui-bridge";
import { isSandboxCommandOpenInterrupt } from "@engenty/ag-ui-bridge";
import {
  conversationEngagement,
  parseAgentMessageHeader,
  resolveAgentEngenty,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { InlineAppArtifact } from "../../../artifacts/inline-app-artifact.js";
import { spaceAgentDeskPath } from "../../../features/agent-form/hire-spaces.js";
import { readChatReferencePart } from "../../../lib/chat-reference-part.js";
import {
  resolveMemoryBreakIndex,
  useThreadMemoryObservationsQuery,
} from "../../../threads/thread-memory-observations.js";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../../ai-elements/message";
import { Shimmer } from "../../ai-elements/shimmer";
import { alterEgoLabel } from "../../alter-ego-label.js";
import { AgentNamePill } from "../agent-name-pill.js";
import { formatElapsedSeconds } from "../composer/agent-status-ticker/format-elapsed-seconds.js";
import { useElapsedSeconds } from "../composer/agent-status-ticker/use-elapsed-seconds.js";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import { SandboxCommandConfirmCard } from "../interrupts/sandbox-command-confirm-card";
import type { SubAgentRunSectionLabels } from "../sub-agent-run/sub-agent-run-sections.js";
import { transcriptHasActiveSandboxCommandToolPart } from "../tool-call/sandbox-command-transcript-utils";
import type { ToolCallCardProps } from "../tool-call/tool-call-card.types";
import { AgentReplyPreview } from "./agent-reply-preview.js";
import {
  type ChatBubbleCluster,
  chatBubbleCluster,
  chatMessageStackClassName,
  chatSpeakerKey,
  chatUserBubbleClassName,
  softenUserInlineCode,
} from "./chat-user-bubble.js";
import { CopilotAttachmentPreview } from "./copilot-attachment-preview.js";
import { CopilotMessageContent } from "./copilot-message-content";
import { CopilotMessageHoverBody } from "./copilot-message-hover-actions.js";
import { shouldShowCopilotThinkingShimmer } from "./copilot-thinking-shimmer";
import { MemoryBreakDivider } from "./memory-break-divider.js";
import { MentionInlineText } from "./mention-inline-text.js";

export interface CopilotTranscriptProps {
  awaitingInterrupt?: boolean;
  /** Optional wrapper for readable max-width columns (e.g. full-page chat). */
  containerClassName?: string;
  /** `tool_call_id` of a decision/feedback chooser rendered in the docked surface; its inline copy is suppressed. */
  dockedInterruptToolCallId?: string | null;
  messages: readonly (AgentTurnMessageLike & { id: string })[];
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

type TranscriptMessage = AgentTurnMessageLike & { id: string };

type VisualRow =
  | { filteredIndex: number; kind: "message"; raw: TranscriptMessage }
  | { kind: "pending" };

/**
 * A user turn that is really a colleague's message (see
 * `formatAgentMessageHeader`): the sender, and the message with the header
 * taken off its first text part.
 */
function splitAgentMessage(
  msg: TranscriptMessage
): { message: TranscriptMessage; senderId: string; senderName: string } | null {
  const parts = msg.parts ?? [];
  const index = parts.findIndex(
    (part) =>
      Boolean(part) &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
  );
  if (index < 0) {
    return null;
  }
  const textPart = parts[index] as { text: string };
  const header = parseAgentMessageHeader(textPart.text);
  if (!header) {
    return null;
  }
  const nextParts = [...parts];
  nextParts[index] = { ...textPart, text: header.body };
  return {
    message: { ...msg, parts: nextParts },
    senderId: header.senderId,
    senderName: header.senderName,
  };
}

/**
 * "Message from <colleague>" — a pointer, not a post. The colleague never
 * speaks in this room; the exchange lives in the pair thread. Drawn like
 * "Messaged <colleague>" (centered context), not like a user bubble.
 */
function AgentMessageLabel(props: {
  fromLabel: string;
  marker: { agentId: string; threadId: string } | null;
  senderId: string;
  senderName: string;
}) {
  const { currentSpace } = useWorkspaceContext();
  const body = (
    <>
      <span>{props.fromLabel}</span>
      <AgentNamePill
        kind={resolveAgentEngenty(props.senderId)}
        name={props.senderName}
      />
    </>
  );
  const className =
    "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs";
  const row =
    props.marker && currentSpace?.key ? (
      <Link
        className={cn(className, "hover:bg-muted/60")}
        to={`${spaceAgentDeskPath(currentSpace.key, props.marker.agentId)}?engagement=${encodeURIComponent(conversationEngagement(props.marker.threadId))}`}
      >
        {body}
      </Link>
    ) : (
      <span className={className}>{body}</span>
    );
  return <div className="my-4 flex w-full justify-center">{row}</div>;
}

export function CopilotTranscript({
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
  const { t } = useTranslation("ai-ui");
  const agentMessageFromLabel = t("agentMessage.from");
  const filteredMessages = messages.filter(
    (msg) =>
      msg.role === "user" || msg.role === "assistant" || msg.role === "system"
  );
  const pendingText = pendingUserText?.trim() || null;
  const pendingParts = pendingUserParts ?? [];
  const pendingRefs = pendingParts.flatMap(
    (part) => readChatReferencePart(part) ?? []
  );
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
  const messagesBeforePending = showPending
    ? filteredMessages.slice(0, pendingInsertIndex)
    : filteredMessages;
  const messagesAfterPending = showPending
    ? filteredMessages.slice(pendingInsertIndex)
    : [];

  const lastAssistantMessage = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i--) {
      const m = filteredMessages[i];
      if (m?.role === "assistant") {
        return m;
      }
    }
    return null;
  }, [filteredMessages]);

  const showThinkingShimmer = shouldShowCopilotThinkingShimmer({
    awaitingInterrupt,
    // A pending (not yet echoed) user turn sits after it in the transcript.
    lastAssistantIsLastMessage:
      !showPending &&
      lastAssistantMessage !== null &&
      filteredMessages.at(-1)?.id === lastAssistantMessage.id,
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
  const memoryBreakIndex = resolveMemoryBreakIndex(
    filteredMessages,
    memoryQuery.data ?? null
  );

  const visualRows: VisualRow[] = [
    ...messagesBeforePending.map((raw, filteredIndex) => ({
      filteredIndex,
      kind: "message" as const,
      raw,
    })),
    ...(showPending ? [{ kind: "pending" as const }] : []),
    ...messagesAfterPending.map((raw, offset) => ({
      filteredIndex: pendingInsertIndex + offset,
      kind: "message" as const,
      raw,
    })),
  ];
  const speakerKeys = visualRows.map((row) =>
    row.kind === "pending" ? "user" : chatSpeakerKey(row.raw)
  );
  const clusterBarriers = new Set<number>();
  if (memoryQuery.data) {
    visualRows.forEach((row, visualIndex) => {
      if (row.kind === "message" && row.filteredIndex === memoryBreakIndex) {
        clusterBarriers.add(visualIndex);
      }
    });
  }
  const clusters = chatBubbleCluster(speakerKeys, clusterBarriers);

  const renderMessage = (
    raw: TranscriptMessage,
    cluster: ChatBubbleCluster,
    stackClassName?: string
  ) => {
    // A built App waiting to be activated: the row IS the App, review banner
    // and all, so the decision sits in the conversation that asked for it. The
    // row's text is written for the model's next turn; printing it above the
    // card would say the same thing twice.
    if (raw.appRelease) {
      return (
        <div className="w-full py-2" key={raw.id}>
          <InlineAppArtifact artifactId={raw.appRelease.artifactId} />
        </div>
      );
    }
    // The desk agent's answer to a colleague, cut to a preview: a quote with
    // a way into the pair thread, not a full assistant bubble.
    if (raw.role === "assistant" && raw.agentMessage?.kind === "reply") {
      return (
        <AgentReplyPreview
          agentId={raw.agentMessage.agentId}
          agentName={raw.authorName ?? null}
          className={stackClassName}
          key={raw.id}
          marker={raw.agentMessage}
          parts={raw.parts}
        />
      );
    }
    // A colleague's message lands as a user turn with a header naming the
    // sender; draw the sender instead of the person whose room it is.
    const agentMessage = raw.role === "user" ? splitAgentMessage(raw) : null;
    const msg = agentMessage?.message ?? raw;
    const showSenderLabel = !cluster.meetsAbove;
    // Stored as a user row so the model sees it, but it is not the person
    // speaking — keep it out of the user lane so it cannot look like a post.
    const isColleagueMarker = Boolean(agentMessage);
    const from = isColleagueMarker
      ? "assistant"
      : (msg.role as "user" | "assistant" | "system");
    return (
      <Message
        className={cn(
          isColleagueMarker
            ? "ml-0 w-full max-w-full"
            : msg.role === "user" && "ml-auto",
          surface === "chat" &&
            (isColleagueMarker ||
              msg.role === "user" ||
              msg.role === "assistant") &&
            "w-full max-w-full",
          stackClassName
        )}
        from={from}
        id={`message-${msg.id}`}
        key={msg.id}
      >
        {showSenderLabel && agentMessage ? (
          <AgentMessageLabel
            fromLabel={agentMessageFromLabel}
            marker={raw.agentMessage ?? null}
            senderId={agentMessage.senderId}
            senderName={agentMessage.senderName}
          />
        ) : showSenderLabel && showAuthorLabels && msg.authorName ? (
          <span
            className={cn(
              "px-1 text-muted-foreground text-xs",
              msg.role === "user" ? "self-end" : "self-start"
            )}
          >
            {msg.alterEgoUserName
              ? alterEgoLabel(msg.alterEgoUserName, t)
              : msg.authorName}
          </span>
        ) : null}
        {/* Attachments render as separate tiles ABOVE the bubble (AI SDK
          Elements message layout) — the bubble carries only the text. */}
        {msg.role === "user" && !isColleagueMarker ? (
          <CopilotAttachmentPreview parts={msg.parts ?? []} />
        ) : null}
        <CopilotMessageHoverBody
          align={isColleagueMarker ? "start" : undefined}
          msg={msg}
          surface={surface}
        >
          <MessageContent
            className={cn(
              surface === "chat" &&
                (msg.role === "assistant" || isColleagueMarker) &&
                "w-full max-w-full px-1 py-0",
              surface === "chat" &&
                msg.role === "user" &&
                !isColleagueMarker &&
                chatUserBubbleClassName(cluster),
              surface === "chat" &&
                msg.role === "system" &&
                "rounded-lg border border-border border-dashed bg-muted/25 px-3 py-2 text-muted-foreground text-xs"
            )}
          >
            <CopilotMessageContent
              dockedInterruptToolCallId={dockedInterruptToolCallId}
              messages={filteredMessages}
              msg={msg}
              status={status}
              subAgentFullViewLabel={subAgentFullViewLabel}
              subAgentSectionLabels={subAgentSectionLabels}
              threadId={threadId}
              toolCardDensity={toolCardDensity}
            />
          </MessageContent>
        </CopilotMessageHoverBody>
      </Message>
    );
  };

  const renderPendingUserMessage = (
    cluster: ChatBubbleCluster,
    stackClassName?: string
  ) => (
    <Message
      className={cn(
        "ml-auto",
        surface === "chat" && "w-full max-w-full",
        stackClassName
      )}
      from="user"
      id="message-pending-send"
      key="pending-send"
    >
      {pendingParts.length > 0 ? (
        <CopilotAttachmentPreview parts={pendingParts} />
      ) : null}
      {pendingText ? (
        <MessageContent
          className={cn(surface === "chat" && chatUserBubbleClassName(cluster))}
        >
          {pendingRefs.length > 0 ? (
            <MentionInlineText refs={pendingRefs} text={pendingText} />
          ) : (
            <MessageResponse>
              {softenUserInlineCode(pendingText)}
            </MessageResponse>
          )}
        </MessageContent>
      ) : null}
    </Message>
  );

  const thread = (
    <>
      {visualRows.map((row, visualIndex) => {
        const cluster = clusters[visualIndex] ?? {
          meetsAbove: false,
          meetsBelow: false,
        };
        const stackClassName =
          surface === "chat"
            ? chatMessageStackClassName(cluster, visualIndex === 0)
            : undefined;
        if (row.kind === "pending") {
          return renderPendingUserMessage(cluster, stackClassName);
        }
        const message = renderMessage(row.raw, cluster, stackClassName);
        return row.filteredIndex === memoryBreakIndex && memoryQuery.data ? (
          <Fragment key={`memory-break-${row.raw.id}`}>
            <MemoryBreakDivider memory={memoryQuery.data} />
            {message}
          </Fragment>
        ) : (
          message
        );
      })}
      {showTrailingSandboxConfirm ? (
        <CopilotTranscriptSandboxInterruptInline open={openInterrupt} />
      ) : null}
      {showThinkingShimmer ? (
        <ThinkingShimmerRow thinkingLabel={thinkingLabel} />
      ) : null}
    </>
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
      >
        {thread}
      </div>
    );
  }

  return thread;
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
