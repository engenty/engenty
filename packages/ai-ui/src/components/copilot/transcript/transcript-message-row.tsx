// One transcript row: a message with the date / memory lines above it. The
// row renders from its own descriptor (see transcript-layout.ts) and is
// memoized, so a streaming token redraws the row it lands in — not the rest.
"use client";

import {
  conversationEngagement,
  parseAgentMessageHeader,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { memo } from "react";
import { Link } from "react-router-dom";
import { InlineAppArtifact } from "../../../artifacts/inline-app-artifact.js";
import { spaceAgentDeskPath } from "../../../features/agent-form/hire-spaces.js";
import type { ThreadMemoryObservations } from "../../../threads/thread-memory-observations.js";
import { Message, MessageContent } from "../../ai-elements/message";
import { alterEgoLabel } from "../../alter-ego-label.js";
import type { SubAgentRunSectionLabels } from "../sub-agent-run/sub-agent-run-sections.js";
import type { ToolCallCardProps } from "../tool-call/tool-call-card.types";
import { AgentReplyPreview } from "./agent-reply-preview.js";
import { ChatAgentFace } from "./chat-agent-face.js";
import { useChatStyle } from "./chat-style.js";
import { chatUserBubbleClassName } from "./chat-user-bubble.js";
import { CopilotAttachmentPreview } from "./copilot-attachment-preview.js";
import {
  CopilotMessageContent,
  chatBubbleBreaks,
} from "./copilot-message-content";
import { CopilotMessageHoverBody } from "./copilot-message-hover-actions.js";
import { MemoryBreakDivider } from "./memory-break-divider.js";
import { TranscriptDateDivider } from "./transcript-date-divider.js";
import type { TranscriptMessage } from "./transcript-layout.js";

interface SplitAgentMessage {
  message: TranscriptMessage;
  senderId: string;
  senderName: string;
}

const splitAgentMessages = new WeakMap<
  TranscriptMessage,
  SplitAgentMessage | null
>();

/**
 * A user turn that is really a colleague's message (see
 * `formatAgentMessageHeader`): the sender, and the message with the header
 * taken off its first text part. Split once per message object, so the row
 * gets the same message on every render.
 */
function splitAgentMessage(msg: TranscriptMessage): SplitAgentMessage | null {
  const cached = splitAgentMessages.get(msg);
  if (cached !== undefined) {
    return cached;
  }
  const split = splitAgentMessageUncached(msg);
  splitAgentMessages.set(msg, split);
  return split;
}

function splitAgentMessageUncached(
  msg: TranscriptMessage
): SplitAgentMessage | null {
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
 * The name above a colleague's bubble. The colleague speaks into this room
 * like the person does — from the right — so its name opens its turn there,
 * and leads into the pair thread where the exchange lives.
 */
function AgentMessageSender(props: {
  fromLabel: string;
  marker: { agentId: string; threadId: string } | null;
  senderName: string;
}) {
  const { currentSpace } = useWorkspaceContext();
  const className = "self-end px-1 font-medium text-primary text-xs";
  return props.marker && currentSpace?.key ? (
    <Link
      aria-label={`${props.fromLabel} ${props.senderName}`}
      className={cn(className, "hover:underline")}
      to={`${spaceAgentDeskPath(currentSpace.key, props.marker.agentId)}?engagement=${encodeURIComponent(conversationEngagement(props.marker.threadId))}`}
    >
      {props.senderName}
    </Link>
  ) : (
    <span className={className}>{props.senderName}</span>
  );
}

/**
 * Where a face stands beside its bubbles. Where the lane box has room for it
 * (`@min-[54rem]/chat-lane`, as in AgentDeskHeader) the bubbles keep the
 * lane's edges — under the desk header's name — and the face hangs in the
 * margin, like the header's own: the agent's on the left, a colleague's on
 * the right. Narrower, a room keeps a face column, where the face says who
 * speaks; a one-to-one chat drops it, as a phone messenger does.
 */
function chatFaceSlotClassName(
  side: "end" | "start",
  showAuthorLabels: boolean
): string {
  return cn(
    "@min-[54rem]/chat-lane:absolute @min-[54rem]/chat-lane:bottom-0 mb-0.5 @min-[54rem]/chat-lane:block w-8 shrink-0",
    side === "start"
      ? "@min-[54rem]/chat-lane:-left-10"
      : "@min-[54rem]/chat-lane:-right-10",
    !showAuthorLabels && "hidden"
  );
}

function chatFaceRowGapClassName(showAuthorLabels: boolean): string | false {
  return showAuthorLabels && "gap-2 @min-[54rem]/chat-lane:gap-0";
}

// On the bubble's body, not the row: `content-visibility` also clips paint,
// and the face and the hover actions sit outside the body. The body already
// clips sideways; the remembered size (`auto`) keeps the scroll height true
// once a row has been drawn. A row with an open popover or disclosure stays
// drawn so its anchor keeps a layout.
const TRANSCRIPT_ROW_DEFER_PAINT_CLASS =
  "[content-visibility:auto] [contain-intrinsic-size:auto_16rem_auto_120px] has-[[data-state=open]]:[content-visibility:visible]";

export interface TranscriptMessageRowProps {
  /** Class of the date line above the row; undefined = no date line. */
  dateDividerClassName: string | undefined;
  /**
   * Let the browser skip laying out and painting this row while it is
   * off screen. Off for the newest rows and the one being written.
   */
  deferPaint: boolean;
  dockedInterruptToolCallId: string | null;
  isLastMessage: boolean;
  meetsAbove: boolean;
  meetsBelow: boolean;
  /** Set on the one row the memory line sits above. */
  memory: ThreadMemoryObservations | undefined;
  /** Class of the memory line above the row; undefined = no memory line. */
  memoryDividerClassName: string | undefined;
  raw: TranscriptMessage;
  showAuthorLabels: boolean;
  showSenderLabel: boolean;
  stackClassName: string | undefined;
  /** This row is being written right now. */
  streaming: boolean;
  subAgentFullViewLabel?: string;
  subAgentSectionLabels?: SubAgentRunSectionLabels;
  surface: "default" | "chat";
  threadId: string | null;
  toolCardDensity: ToolCallCardProps["density"];
  toolDetail: "developer" | "person";
}

export const TranscriptMessageRow = memo(function TranscriptMessageRow(
  props: TranscriptMessageRowProps
) {
  const dividers =
    props.memoryDividerClassName !== undefined ||
    props.dateDividerClassName !== undefined;
  const message = <TranscriptMessageBody {...props} />;
  if (!dividers) {
    return message;
  }
  return (
    <>
      {props.memoryDividerClassName !== undefined && props.memory ? (
        <MemoryBreakDivider
          className={props.memoryDividerClassName || undefined}
          memory={props.memory}
        />
      ) : null}
      {props.dateDividerClassName === undefined ? null : (
        <div className={props.dateDividerClassName || undefined}>
          <TranscriptDateDivider at={props.raw.createdAt} />
        </div>
      )}
      {message}
    </>
  );
});

function TranscriptMessageBody({
  deferPaint,
  dockedInterruptToolCallId,
  isLastMessage,
  meetsAbove,
  meetsBelow,
  raw,
  showAuthorLabels,
  showSenderLabel,
  stackClassName,
  streaming,
  subAgentFullViewLabel,
  subAgentSectionLabels,
  surface,
  threadId,
  toolCardDensity,
  toolDetail,
}: TranscriptMessageRowProps) {
  const { t } = useTranslation("ai-ui");
  const chatStyle = useChatStyle();
  // A built App waiting to be activated: the row IS the App, review banner
  // and all, so the decision sits in the conversation that asked for it. The
  // row's text is written for the model's next turn; printing it above the
  // card would say the same thing twice.
  if (raw.appRelease) {
    return (
      <div className="w-full py-2">
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
        marker={raw.agentMessage}
        parts={raw.parts}
      />
    );
  }
  // A colleague's message lands as a user turn with a header naming the
  // sender; draw the sender instead of the person whose room it is.
  const agentMessage = raw.role === "user" ? splitAgentMessage(raw) : null;
  const msg = agentMessage?.message ?? raw;
  // Messenger layout: the agent speaks from the left, its face at the foot
  // of each run of bubbles and its name above the first.
  // A row with nothing to say in words — only clips or cards — is no
  // bubble, so it gets neither face nor name.
  const messenger =
    chatStyle === "bubbles" &&
    msg.role === "assistant" &&
    chatBubbleBreaks(msg, toolDetail).words;
  // A colleague writes into this room as the person does: a user bubble on
  // the right, with its own name above and its face at the foot.
  const colleague = Boolean(agentMessage) && chatStyle === "bubbles";
  const message = (
    <Message
      className={cn(
        messenger && "min-w-0 max-w-[min(100%,48rem)] flex-1",
        colleague && "min-w-0 flex-1",
        msg.role === "user" && "ml-auto",
        surface === "chat" &&
          (msg.role === "user" || msg.role === "assistant") &&
          "w-full max-w-full",
        // The room for the actions beside an agent's bubble is the hover
        // body's to keep: it knows whether they stand in a row or a column.
        !(messenger || colleague) && stackClassName
      )}
      from={msg.role as "user" | "assistant" | "system"}
      id={`message-${msg.id}`}
    >
      {messenger ? null : showSenderLabel && agentMessage ? (
        <AgentMessageSender
          fromLabel={t("agentMessage.from")}
          marker={raw.agentMessage ?? null}
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
      {msg.role === "user" ? (
        <CopilotAttachmentPreview parts={msg.parts ?? []} />
      ) : null}
      <CopilotMessageHoverBody beside={messenger} msg={msg} surface={surface}>
        <MessageContent
          className={cn(
            deferPaint && TRANSCRIPT_ROW_DEFER_PAINT_CLASS,
            surface === "chat" &&
              !messenger &&
              msg.role === "assistant" &&
              "w-full max-w-full px-1 py-0",
            messenger && "max-w-full px-0 py-0",
            surface === "chat" &&
              msg.role === "user" &&
              chatUserBubbleClassName({ meetsAbove, meetsBelow }),
            surface === "chat" &&
              msg.role === "system" &&
              "rounded-lg border border-border border-dashed bg-muted/25 px-3 py-2 text-muted-foreground text-xs"
          )}
        >
          <CopilotMessageContent
            dockedInterruptToolCallId={dockedInterruptToolCallId}
            isLastMessage={isLastMessage}
            msg={msg}
            streaming={streaming}
            subAgentFullViewLabel={subAgentFullViewLabel}
            subAgentSectionLabels={subAgentSectionLabels}
            threadId={threadId}
            toolCardDensity={toolCardDensity}
            toolDetail={toolDetail}
            {...(messenger && showSenderLabel && msg.authorName
              ? {
                  bubbleLabel: (
                    <span className="px-3.5 font-medium text-primary text-xs">
                      {msg.alterEgoUserName
                        ? alterEgoLabel(msg.alterEgoUserName, t)
                        : msg.authorName}
                    </span>
                  ),
                }
              : {})}
          />
        </MessageContent>
      </CopilotMessageHoverBody>
    </Message>
  );
  if (colleague && agentMessage) {
    // The agent row mirrored: the colleague's face at the foot of its run,
    // on the right. A one-to-one chat hangs it in the margin, as there.
    return (
      <div
        className={cn(
          "relative flex w-full items-end",
          chatFaceRowGapClassName(showAuthorLabels),
          stackClassName
        )}
      >
        {message}
        <div className={chatFaceSlotClassName("end", showAuthorLabels)}>
          {meetsBelow ? null : (
            <ChatAgentFace
              agentId={agentMessage.senderId}
              name={agentMessage.senderName}
              size={32}
            />
          )}
        </div>
      </div>
    );
  }
  if (!messenger) {
    return message;
  }
  return (
    <div
      className={cn(
        "relative flex w-full items-end",
        chatFaceRowGapClassName(showAuthorLabels),
        stackClassName
      )}
    >
      <div className={chatFaceSlotClassName("start", showAuthorLabels)}>
        {meetsBelow ? null : (
          <ChatAgentFace
            agentId={msg.authorAgentId}
            name={msg.authorName}
            size={32}
          />
        )}
      </div>
      {message}
    </div>
  );
}
