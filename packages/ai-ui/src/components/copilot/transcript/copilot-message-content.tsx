// CopilotMessageContent — renders AG-UI message parts: a ChainOfThought timeline
// for tool steps and MessageResponse for text parts. Reasoning is not rendered yet
// (the server does not produce reasoning parts) — see the parked server vertical
// in docs/content/wip/roadmap/enhancing-copilot/reasoning-vertical.md.
"use client";

import { cn } from "@engenty/ui-core";
import { useContext, useMemo } from "react";
import { EngentyAIContext } from "../../../agent-provider/engenty-ai-provider.js";
import { copilotChatSubRunPath } from "../../../copilot/copilot-chat-paths.js";
import { readChatReferencePart } from "../../../lib/chat-reference-part.js";
import { ObjectRefMentions } from "../../../objects/object-ref-mentions.js";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "../../ai-elements/chain-of-thought";
import { MessageResponse } from "../../ai-elements/message";
import {
  type CitationItem,
  SourceCitations,
} from "../../ai-elements/source-citations.js";
import { parseDecisionResolution } from "../interrupts/decision-artifact.js";
import { parseFeedbackResolution } from "../interrupts/feedback-artifact.js";
import { ToolCallCard } from "../tool-call/tool-call-card";
import type { ToolCallCardProps } from "../tool-call/tool-call-card.types";
import { hasStandaloneToolCallUi } from "../tool-call/tool-call-ui-registry";
import {
  GenericToolStep,
  isSkillToolName,
  SkillStep,
  WebSearchStep,
} from "./chain-of-thought-steps";
import { softenUserInlineCode } from "./chat-user-bubble.js";
import {
  getToolDisplayLabel,
  getToolName,
  getToolResolvedName,
  getToolState,
  isA2uiToolPart,
  isConnectRequestToolPart,
  isMcpAppWidgetToolPart,
  isObjectRenderToolPart,
  isProgressPart,
  isReasoningPart,
  isSubAgentDelegationTool,
  isToolPart,
  type ReasoningPartLike,
  type ToolPartLike,
} from "./copilot-message-parts";
import { MentionInlineText } from "./mention-inline-text.js";

// Assistant messages that streamed during this page session. A tool part only
// enters the transcript once its output is complete, so a card can never
// observe its own "running" state — but the message around it does render
// while the run streams. Recording that here is the only signal a card has to
// tell "this just happened" from "this was loaded from storage".
// Written during render (parents render before children) so the flag is
// already set when a card's first effect runs; the set is an idempotent cache.
const liveRunMessageIds = new Set<string>();

export function clearLiveRunMessagesForTests() {
  liveRunMessageIds.clear();
}

// Tool-timeline header label — tool-oriented wording ("Working…", "Used N tools")
// so the block reads as tool use rather than the generic "Thinking…".
function toolTimelineLabel(
  count: number
): (isStreaming: boolean, duration?: number) => string {
  return (isStreaming, duration) => {
    if (isStreaming) {
      return "Working…";
    }
    if (typeof duration === "number") {
      return `Worked for ${duration}s`;
    }
    return count === 1 ? "Used 1 tool" : `Used ${count} tools`;
  };
}

// Classify a part as "reasoning", "web_search", "skill", or a generic tool
type PartKind =
  | { kind: "reasoning"; part: ReasoningPartLike }
  | { kind: "web_search"; part: ToolPartLike; toolName: string }
  | { kind: "skill"; part: ToolPartLike; toolName: string }
  | { kind: "tool"; part: ToolPartLike; toolName: string }
  | { kind: "text"; text: string }
  | { kind: "skip" };

function isInteractiveDecisionToolPart(part: ToolPartLike): boolean {
  const toolName = getToolName(part);
  return (
    toolName === "requestDecision" ||
    toolName === "requestFeedback" ||
    // Parks on its Publish card, so the unanswered copy belongs to the dock
    // exactly like a chooser's.
    toolName === "workflow_propose"
  );
}

function isInteractiveDecisionToolResolved(part: ToolPartLike): boolean {
  const toolName = getToolName(part);
  if (toolName === "requestDecision") {
    return parseDecisionResolution(part.output) !== null;
  }
  if (toolName === "requestFeedback") {
    return parseFeedbackResolution(part.output) !== null;
  }
  if (toolName === "workflow_propose") {
    // Any output means the call is past its park: the publish decision came
    // back (or the call never suspended — validation failure, headless run).
    return part.output != null;
  }
  return false;
}

function classifyPart(part: unknown): PartKind {
  if (!part || typeof part !== "object") {
    return { kind: "skip" };
  }
  const p = part as { type?: string; text?: string };

  if (isProgressPart(part)) {
    return { kind: "skip" };
  }

  if (isReasoningPart(part)) {
    return { kind: "reasoning", part };
  }

  if (isToolPart(part)) {
    const toolName = getToolName(part);
    if (!toolName) {
      return { kind: "skip" };
    }
    const resolved = getToolResolvedName(part, toolName).toLowerCase();
    const isWebSearch =
      resolved.includes("web_search") ||
      resolved.includes("websearch") ||
      toolName.toLowerCase().includes("web_search");
    if (isWebSearch) {
      return { kind: "web_search", part, toolName };
    }
    if (isSkillToolName(resolved) || isSkillToolName(toolName)) {
      return { kind: "skill", part, toolName };
    }
    return { kind: "tool", part, toolName };
  }

  if (p.type === "text") {
    const text = (p.text ?? "").trim();
    return text ? { kind: "text", text } : { kind: "skip" };
  }

  return { kind: "skip" };
}

// --- Main export ---

export interface CopilotMessageContentProps {
  /** Suppress the inline copy of the decision/feedback chooser docked above the composer. */
  dockedInterruptToolCallId?: string | null;
  messages: Array<{ id: string }>;
  msg: { id: string; role: string; parts?: readonly unknown[] };
  status: string;
  subAgentFullViewLabel?: string;
  subAgentSectionLabels?: ToolCallCardProps["subAgentSectionLabels"];
  threadId?: string | null;
  toolCardDensity?: ToolCallCardProps["density"];
}

// Full-page monitor only exists on module copilot chat; omit link when threadId
// is unknown (e.g. ephemeral drawer lane without a persisted apps/ai thread).
function resolveSubAgentFullPageHref(input: {
  part: ToolPartLike;
  threadId?: string | null;
  toolCallId?: string;
  toolName: string;
}): string | null {
  const threadId = input.threadId?.trim() ?? "";
  const toolCallId = input.toolCallId?.trim() ?? "";
  if (
    !(
      threadId &&
      toolCallId &&
      isSubAgentDelegationTool(input.part, input.toolName)
    )
  ) {
    return null;
  }
  return copilotChatSubRunPath(threadId, toolCallId);
}

function renderToolCallCardRow(input: {
  index: number;
  isLiveRun: boolean;
  msgId: string;
  part: ToolPartLike;
  subAgentFullViewLabel?: string;
  subAgentSectionLabels?: ToolCallCardProps["subAgentSectionLabels"];
  threadId: string | null;
  toolCardDensity: ToolCallCardProps["density"];
  toolName: string;
}) {
  const {
    index,
    isLiveRun,
    msgId,
    part,
    subAgentFullViewLabel,
    subAgentSectionLabels,
    threadId,
    toolCardDensity,
    toolName,
  } = input;
  return (
    <ToolCallCard
      className={cn(
        "mb-0.5 w-full",
        isSubAgentDelegationTool(part, toolName) && "max-w-none",
        toolName === "message_agent" && "mb-0"
      )}
      density={toolCardDensity}
      displayLabel={getToolDisplayLabel(part, toolName)}
      errorText={part.errorText}
      fullPageHref={resolveSubAgentFullPageHref({
        part,
        threadId,
        toolCallId: part.toolCallId,
        toolName,
      })}
      fullPageLabel={subAgentFullViewLabel}
      input={part.input}
      isLiveRun={isLiveRun}
      key={`${msgId}-${index}`}
      metadata={part.metadata}
      output={part.output}
      progressLines={part.progressLines}
      resolvedToolName={getToolResolvedName(part, toolName)}
      state={getToolState(part)}
      subAgentSectionLabels={subAgentSectionLabels}
      toolCallId={part.toolCallId}
      toolName={toolName}
    />
  );
}

export function CopilotMessageContent({
  msg,
  messages,
  status,
  subAgentFullViewLabel,
  subAgentSectionLabels,
  threadId = null,
  toolCardDensity = "default",
  dockedInterruptToolCallId = null,
}: CopilotMessageContentProps) {
  const parts = msg.parts ?? [];
  const isLastMessage = msg.id === messages.at(-1)?.id;
  const isCurrentlyStreaming = status === "streaming" && isLastMessage;
  if (isCurrentlyStreaming) {
    liveRunMessageIds.add(msg.id);
  }
  const isLiveRun = liveRunMessageIds.has(msg.id);

  // Classify all parts
  const classified = parts.map(classifyPart);

  // ChainOfThought collects every regular tool in the turn as a step list
  // (AI Elements-style). Standalone / HITL cards escape the timeline; text
  // never splits the tool list — otherwise tools after an intermediate text
  // part (or a "Working…" placeholder) would render as a single current card
  // instead of an expandable list.
  const thoughtParts: Array<{ index: number; kind: PartKind }> = [];
  const textParts: Array<{ index: number; text: string }> = [];
  // HITL choosers (and late standalone cards) that stay outside the timeline.
  const trailingToolParts: Array<{
    index: number;
    part: ToolPartLike;
    toolName: string;
  }> = [];
  // Tool parts whose card IS the answer — agent-* delegations
  // (SubAgentTaskToolCallCard) and object renders (contact/offer/task cards).
  // They render full-width above the text, never as a one-line thought step.
  const preTextCardParts: Array<{
    index: number;
    part: ToolPartLike;
    toolName: string;
  }> = [];

  // Boundary for whether a standalone card sits above vs below the answer text.
  const textIndices = classified
    .map((c, i) => (c.kind === "text" ? i : -1))
    .filter((i) => i >= 0);
  const lastTextIndex =
    textIndices.length > 0 ? (textIndices.at(-1) ?? -1) : -1;

  for (let i = 0; i < classified.length; i++) {
    const c = classified[i];
    if (!c) {
      continue;
    }
    if (c.kind === "skip") {
      continue;
    }

    if (c.kind === "text") {
      textParts.push({ index: i, text: c.text });
      continue;
    }

    if (
      (c.kind === "tool" || c.kind === "web_search" || c.kind === "skill") &&
      isInteractiveDecisionToolPart(c.part)
    ) {
      const isDocked =
        dockedInterruptToolCallId != null &&
        c.part.toolCallId === dockedInterruptToolCallId;
      const isResolved = isInteractiveDecisionToolResolved(c.part);
      // The docked surface above the composer owns the UNANSWERED copy, so the
      // HITL chooser appears exactly once. Once answered it owns nothing: the
      // dock clears, and an answered row that is still skipped here leaves the
      // question and the answer nowhere in the transcript at all.
      if (isDocked && !isResolved) {
        continue;
      }
      const decisionEntry = {
        index: i,
        part: c.part,
        toolName: c.toolName,
      };
      // Answered rows render as a standalone card (the question plus the
      // choice), which is why they follow the same placement rule as the other
      // standalone cards rather than always trailing the turn. The card renders
      // itself resolved — offering buttons again would be offering buttons that
      // resolve nothing.
      if (isResolved && (i <= lastTextIndex || lastTextIndex === -1)) {
        preTextCardParts.push(decisionEntry);
      } else {
        trailingToolParts.push(decisionEntry);
      }
      continue;
    }

    if (
      (c.kind === "tool" || c.kind === "web_search" || c.kind === "skill") &&
      (isSubAgentDelegationTool(c.part, c.toolName) ||
        isObjectRenderToolPart(c.part, c.toolName) ||
        isA2uiToolPart(c.part, c.toolName) ||
        isMcpAppWidgetToolPart(c.part, c.toolName) ||
        isConnectRequestToolPart(c.part, c.toolName) ||
        // Module-registered standalone cards (artifact, generative UI, …)
        // escape the collapsed timeline too — the persisted row coalesces the
        // turn into one message, so without this the card renders live but
        // folds into "Used N tools" after a reload.
        hasStandaloneToolCallUi({
          displayLabel: c.part.displayLabel,
          input: c.part.input,
          output: c.part.output,
          resolvedToolName: getToolResolvedName(c.part, c.toolName),
          state: getToolState(c.part),
          toolName: c.toolName,
        }))
    ) {
      if (i <= lastTextIndex || lastTextIndex === -1) {
        preTextCardParts.push({
          index: i,
          part: c.part,
          toolName: c.toolName,
        });
      } else {
        trailingToolParts.push({
          index: i,
          part: c.part,
          toolName: c.toolName,
        });
      }
      continue;
    }

    // Regular tools + (parked) reasoning → one expandable step list.
    thoughtParts.push({ index: i, kind: c });
  }

  const citations = useCitations(textParts, parts);
  const userRefs = useMemo(
    () =>
      msg.role === "user"
        ? (msg.parts ?? []).flatMap((part) => readChatReferencePart(part) ?? [])
        : [],
    [msg.parts, msg.role]
  );

  const rewrittenTextParts = useMemo(
    () =>
      textParts.map((tp, tpIndex) => {
        let text = tp.text;
        for (const citation of citations) {
          if (
            citation.originalUrl &&
            citation.url &&
            citation.originalUrl !== citation.url
          ) {
            text = text.replaceAll(citation.originalUrl, citation.url);
          }
        }
        // A user turn that starts with a slash command renders the token as an
        // inline code chip (display-only; the persisted text stays raw).
        if (msg.role === "user" && tpIndex === 0) {
          text = text.replace(/^(\/[a-z0-9][a-z0-9-]*)(\s|$)/, "`$1`$2");
        }
        if (msg.role === "user") {
          text = softenUserInlineCode(text);
        }
        return { ...tp, text };
      }),
    [textParts, citations, msg.role]
  );

  // Tool steps render in the ChainOfThought timeline. Reasoning parts (if any ever
  // arrive) are excluded so the header count stays tool-accurate — reasoning has no
  // renderer until the server vertical lands (reasoning-vertical.md).
  const toolThoughtParts = thoughtParts.filter(
    ({ kind }) => kind.kind !== "reasoning"
  );

  // Determine if any tool thought part is currently streaming
  const isThoughtStreaming =
    isCurrentlyStreaming &&
    toolThoughtParts.some(({ kind }) => {
      if (
        kind.kind === "tool" ||
        kind.kind === "web_search" ||
        kind.kind === "skill"
      ) {
        const state = getToolState(kind.part);
        return state === "running" || state === "pending";
      }
      return false;
    });

  const showChainOfThought = toolThoughtParts.length > 0;

  return (
    <>
      {showChainOfThought ? (
        <ChainOfThought
          className="mb-1.5 w-full"
          isStreaming={isThoughtStreaming}
        >
          <ChainOfThoughtHeader
            getLabel={toolTimelineLabel(toolThoughtParts.length)}
          />
          <ChainOfThoughtContent>
            {toolThoughtParts.map(({ index, kind }) => {
              if (kind.kind === "web_search") {
                const toolState = getToolState(kind.part);
                const partIsStreaming =
                  isCurrentlyStreaming &&
                  (toolState === "running" || toolState === "pending");
                return (
                  <WebSearchStep
                    isStreaming={partIsStreaming}
                    key={`${msg.id}-${index}`}
                    part={kind.part}
                  />
                );
              }
              if (kind.kind === "skill") {
                const toolState = getToolState(kind.part);
                const partIsStreaming =
                  isCurrentlyStreaming &&
                  (toolState === "running" || toolState === "pending");
                return (
                  <SkillStep
                    isStreaming={partIsStreaming}
                    key={`${msg.id}-${index}`}
                    part={kind.part}
                    toolName={kind.toolName}
                  />
                );
              }
              if (kind.kind === "tool") {
                const toolState = getToolState(kind.part);
                const partIsStreaming =
                  isCurrentlyStreaming &&
                  (toolState === "running" || toolState === "pending");
                return (
                  <GenericToolStep
                    isStreaming={partIsStreaming}
                    key={`${msg.id}-${index}`}
                    part={kind.part}
                    toolName={kind.toolName}
                  />
                );
              }
              return null;
            })}
          </ChainOfThoughtContent>
        </ChainOfThought>
      ) : null}

      {preTextCardParts.map(({ index, part, toolName }) =>
        renderToolCallCardRow({
          index,
          isLiveRun,
          msgId: msg.id,
          part,
          subAgentFullViewLabel,
          subAgentSectionLabels,
          threadId,
          toolCardDensity,
          toolName,
        })
      )}

      {rewrittenTextParts.map(({ index, text }) =>
        // A person's turn with @-mentions is drawn as typed, pills inline —
        // the mention is the point of the message, not a footnote to it.
        userRefs.length > 0 ? (
          <MentionInlineText
            key={`${msg.id}-${index}`}
            refs={userRefs}
            text={text}
          />
        ) : (
          <MessageResponse key={`${msg.id}-${index}`}>{text}</MessageResponse>
        )
      )}

      <SourceCitations citations={citations} />

      <ObjectRefMentions
        parts={msg.parts ?? []}
        text={rewrittenTextParts.map(({ text }) => text).join("\n")}
      />

      {trailingToolParts.map(({ index, part, toolName }) =>
        renderToolCallCardRow({
          index,
          isLiveRun,
          msgId: msg.id,
          part,
          subAgentFullViewLabel,
          subAgentSectionLabels,
          threadId,
          toolCardDensity,
          toolName,
        })
      )}
    </>
  );
}

function useCitations(
  textParts: Array<{ text: string }>,
  parts: readonly unknown[]
) {
  const aiContext = useContext(EngentyAIContext);

  return useMemo((): CitationItem[] => {
    const combinedText = textParts.map((t) => t.text).join("\n");
    const parsed: CitationItem[] = [];
    const seenUrls = new Set<string>();

    // 1. Match markdown links: [Title](/kb/kbId/slug#L1-L2) or [Title](/mdl/knowledge-base/kbSlug/slug#L1-L2)
    // Supports optional http://... or https://... host prefix.
    const mdLinkRegex =
      /\[([^\]]+)\]\(\s*((?:https?:\/\/[^/]+)?(\/kb\/|\/mdl\/knowledge-base\/)([a-zA-Z0-9-]{36}|[a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)(?:#L\d+(?:-L?\d+)?)?)\s*\)/gi;
    let mdMatch: RegExpExecArray | null;
    mdLinkRegex.lastIndex = 0;
    while (true) {
      mdMatch = mdLinkRegex.exec(combinedText);
      if (!mdMatch) {
        break;
      }
      const title = mdMatch[1]?.trim() || "";
      const url = mdMatch[2]?.trim() || "";
      const slug = mdMatch[5]?.trim() || "";
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        parsed.push({ title, url, originalUrl: url, slug });
      }
    }

    // 2. Match plain text patterns: Quelle: Artikel "Title" - /kb/kbId/slug#L1-L2
    // or simply /kb/kbId/slug (supports optional host prefix)
    const plainLinkRegex =
      /(?:Artikel\s+"([^"]+)"\s*-\s*)?((?:https?:\/\/[^/]+)?(\/kb\/|\/mdl\/knowledge-base\/)([a-zA-Z0-9-]{36}|[a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)(?:#L\d+(?:-L?\d+)?)?)/gi;
    let plainMatch: RegExpExecArray | null;
    plainLinkRegex.lastIndex = 0;
    while (true) {
      plainMatch = plainLinkRegex.exec(combinedText);
      if (!plainMatch) {
        break;
      }
      const title = plainMatch[1]?.trim() || "";
      const url = plainMatch[2]?.trim() || "";
      const slug = plainMatch[5]?.trim() || "";
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        parsed.push({
          title: title || slug || "Reference",
          url,
          originalUrl: url,
          slug,
        });
      }
    }

    // Fill in details (chunkText, startLine, endLine, kbName) from search tool output in the same run
    const searchParts = (parts ?? []).filter((p: any) => {
      if (!isToolPart(p)) {
        return false;
      }
      const toolName = getToolName(p);
      const resolved = getToolResolvedName(p, toolName);
      return resolved === "knowledge_base_article_search";
    });

    const allSearchResults: any[] = [];
    for (const sp of searchParts) {
      const out = (sp as any).output;
      if (out && typeof out === "object") {
        if (Array.isArray(out.results)) {
          for (const r of out.results) {
            if (r) {
              allSearchResults.push(r.item ?? r);
            }
          }
        } else if (Array.isArray(out)) {
          allSearchResults.push(...out);
        }
      }
    }

    for (const citation of parsed) {
      const anchorMatch = citation.url.match(/#L(\d+)(?:-L?(\d+))?/i);
      if (anchorMatch) {
        citation.startLine = Number.parseInt(anchorMatch[1]!, 10);
        if (anchorMatch[2]) {
          citation.endLine = Number.parseInt(anchorMatch[2]!, 10);
        } else {
          citation.endLine = citation.startLine;
        }
      }

      const matchedItem = allSearchResults.find(
        (item) =>
          item.slug === citation.slug ||
          item.article_id === citation.slug ||
          citation.url.includes(item.article_id) ||
          (item.url && citation.url.includes(item.url))
      );

      if (matchedItem) {
        if (!citation.title || citation.title === citation.slug) {
          citation.title = matchedItem.title || citation.title;
        }
        citation.chunkText = matchedItem.chunk_text || "";
        citation.kbName = matchedItem.kb_name || "";

        if (citation.startLine === undefined) {
          citation.startLine = matchedItem.start_line;
          citation.endLine = matchedItem.end_line;
        }
        citation.chunkStartLine = matchedItem.start_line;

        const kbSlug = matchedItem.kb_slug || matchedItem.kbSlug;
        if (kbSlug && matchedItem.article_id) {
          const anchor = citation.url.includes("#")
            ? citation.url.slice(citation.url.indexOf("#"))
            : "";
          if (aiContext?.resolveKbArticleHref) {
            citation.url = `${aiContext.resolveKbArticleHref(kbSlug, matchedItem.article_id)}${anchor}`;
          } else {
            citation.url = `/mdl/knowledge-base/${kbSlug}/${matchedItem.article_id}${anchor}`;
          }
        }
      }
    }

    return parsed;
  }, [textParts, parts, aiContext?.resolveKbArticleHref]);
}
