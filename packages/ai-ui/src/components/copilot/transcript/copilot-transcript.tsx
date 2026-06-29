// Copilot transcript — renders AG-UI message parts, tool rows, and thinking shimmer.
"use client";

import type {
  AgentTurnMessageLike,
  AgUiOpenInterruptMetadata,
} from "@engenty/ag-ui-bridge";
import { isSandboxCommandOpenInterrupt } from "@engenty/ag-ui-bridge";
import { cn } from "@engenty/ui-core";
import { Copy, Link2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "../../ai-elements/message";
import { Shimmer } from "../../ai-elements/shimmer";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import { SandboxCommandConfirmCard } from "../interrupts/sandbox-command-confirm-card";
import type { SubAgentRunSectionLabels } from "../sub-agent-run/sub-agent-run-sections.js";
import { transcriptHasActiveSandboxCommandToolPart } from "../tool-call/sandbox-command-transcript-utils";
import type { ToolCallCardProps } from "../tool-call/tool-call-card.types";
import { CopilotMessageContent } from "./copilot-message-content";
import { shouldShowCopilotThinkingShimmer } from "./copilot-thinking-shimmer";

export interface CopilotTranscriptProps {
  awaitingInterrupt?: boolean;
  /** Optional wrapper for readable max-width columns (e.g. full-page chat). */
  containerClassName?: string;
  /** `tool_call_id` of a decision/feedback chooser rendered in the docked surface; its inline copy is suppressed. */
  dockedInterruptToolCallId?: string | null;
  messages: readonly (AgentTurnMessageLike & { id: string })[];
  openInterrupt?: AgUiOpenInterruptMetadata | null;
  /** Insert index for `pendingUserText` while assistant content streams after submit. */
  pendingUserInsertIndex?: number | null;
  /** Optimistic user text while a run is in flight (not duplicated in `messages`). */
  pendingUserText?: string | null;
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

export function CopilotTranscript({
  containerClassName,
  messages,
  pendingUserInsertIndex,
  pendingUserText,
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
  const filteredMessages = messages.filter(
    (msg) =>
      msg.role === "user" || msg.role === "assistant" || msg.role === "system"
  );
  const pendingText = pendingUserText?.trim() || null;
  const pendingInsertIndex =
    pendingText == null
      ? filteredMessages.length
      : Math.max(
          0,
          Math.min(
            typeof pendingUserInsertIndex === "number" &&
              Number.isFinite(pendingUserInsertIndex)
              ? pendingUserInsertIndex
              : 0,
            filteredMessages.length
          )
        );
  const messagesBeforePending = pendingText
    ? filteredMessages.slice(0, pendingInsertIndex)
    : filteredMessages;
  const messagesAfterPending = pendingText
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

  const renderMessage = (msg: (typeof filteredMessages)[number]) => (
    <Message
      className={cn(
        msg.role === "user" && "ml-auto",
        surface === "chat" && msg.role === "user" && "max-w-[min(100%,28rem)]",
        surface === "chat" && msg.role === "assistant" && "w-full max-w-full"
      )}
      from={msg.role as "user" | "assistant" | "system"}
      id={`message-${msg.id}`}
      key={msg.id}
    >
      <MessageContent
        className={cn(
          surface === "chat" &&
            msg.role === "assistant" &&
            "w-full max-w-full px-1 py-0",
          surface === "chat" &&
            msg.role === "user" &&
            "border! rounded-2xl! border-primary/20! bg-primary/10! px-4! py-3! shadow-sm",
          surface === "chat" &&
            msg.role === "system" &&
            "rounded-lg border border-border/70 border-dashed bg-muted/25 px-3 py-2 text-muted-foreground text-xs"
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
      <MessageTools msg={msg} surface={surface} />
    </Message>
  );

  const pendingUserMessage =
    pendingText == null ? null : (
      <Message
        className={cn(
          "ml-auto",
          surface === "chat" && "max-w-[min(100%,28rem)]"
        )}
        from="user"
        id="message-pending-send"
        key="pending-send"
      >
        <MessageContent
          className={cn(
            surface === "chat" &&
              "border! rounded-2xl! border-primary/20! bg-primary/10! px-4! py-3! shadow-sm"
          )}
        >
          <MessageResponse>{pendingText}</MessageResponse>
        </MessageContent>
      </Message>
    );

  const thread = (
    <>
      {messagesBeforePending.map(renderMessage)}
      {pendingUserMessage}
      {messagesAfterPending.map(renderMessage)}
      {showTrailingSandboxConfirm ? (
        <CopilotTranscriptSandboxInterruptInline open={openInterrupt} />
      ) : null}
      {showThinkingShimmer ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Shimmer as="span" duration={2} spread={2}>
            {thinkingLabel}
          </Shimmer>
        </div>
      ) : null}
    </>
  );

  if (containerClassName?.trim()) {
    return (
      <div className={cn("flex min-w-0 flex-col", containerClassName.trim())}>
        {thread}
      </div>
    );
  }

  return thread;
}

function CopilotTranscriptSandboxInterruptInline(props: {
  open: AgUiOpenInterruptMetadata;
}) {
  const { onFrontendToolApprove, onFrontendToolReject } =
    useCopilotToolCallActions();

  return (
    <SandboxCommandConfirmCard
      onApprove={() => onFrontendToolApprove?.(props.open)}
      onReject={() => onFrontendToolReject?.(props.open)}
      open={props.open}
    />
  );
}

function extractCopyText(parts: readonly unknown[] | undefined): string {
  const chunks: string[] = [];
  for (const part of parts ?? []) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const candidate = part as { text?: unknown; type?: unknown };
    if (
      (candidate.type === "text" || candidate.type === "reasoning") &&
      typeof candidate.text === "string"
    ) {
      const text = candidate.text.trim();
      if (text) {
        chunks.push(text);
      }
    }
  }
  return chunks.join("\n\n").trim();
}

function MessageTools({
  msg,
  surface,
}: {
  msg: { id: string; parts?: readonly unknown[]; role: string };
  surface: "default" | "chat";
}) {
  const [copiedKind, setCopiedKind] = useState<"copy" | "link" | null>(null);
  const text = useMemo(() => extractCopyText(msg.parts), [msg.parts]);

  const flashCopied = useCallback((kind: "copy" | "link") => {
    setCopiedKind(kind);
    window.setTimeout(() => {
      setCopiedKind((current) => (current === kind ? null : current));
    }, 1400);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!text) {
      return;
    }
    await navigator.clipboard.writeText(text);
    flashCopied("copy");
  }, [flashCopied, text]);

  const handleCopyLink = useCallback(async () => {
    const url = new URL(window.location.href);
    url.hash = `message-${msg.id}`;
    await navigator.clipboard.writeText(url.toString());
    flashCopied("link");
  }, [flashCopied, msg.id]);

  if (!text) {
    return null;
  }

  return (
    <MessageActions
      className={cn(
        "mt-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
        msg.role === "user" ? "justify-end self-end" : "justify-start",
        surface === "chat" && "px-1"
      )}
    >
      <MessageAction
        label="Copy message"
        onClick={() => {
          void handleCopy();
        }}
        tooltip={copiedKind === "copy" ? "Copied" : "Copy message"}
      >
        <Copy className="size-3.5" />
      </MessageAction>
      <MessageAction
        label="Copy message link"
        onClick={() => {
          void handleCopyLink();
        }}
        tooltip={copiedKind === "link" ? "Link copied" : "Copy link"}
      >
        <Link2 className="size-3.5" />
      </MessageAction>
    </MessageActions>
  );
}
