// CopilotMessageContent — renders AG-UI message parts: a ChainOfThought timeline
// for tool steps and MessageResponse for text parts. Reasoning is not rendered yet
// (the server does not produce reasoning parts) — see the parked server vertical
// in docs/content/wip/roadmap/enhancing-copilot/reasoning-vertical.md.
"use client";

import { cn } from "@engenty/ui-core";
import { useContext, useMemo } from "react";
import { EngentyAIContext } from "../../../agent-provider/engenty-ai-provider.js";
import { copilotChatSubRunPath } from "../../../copilot/copilot-chat-paths.js";
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
import { GenericToolStep, WebSearchStep } from "./chain-of-thought-steps";
import { CopilotAttachmentPreview } from "./copilot-attachment-preview.js";
import {
  getToolDisplayLabel,
  getToolName,
  getToolResolvedName,
  getToolState,
  isProgressPart,
  isReasoningPart,
  isSubAgentDelegationTool,
  isToolPart,
  type ReasoningPartLike,
  type ToolPartLike,
} from "./copilot-message-parts";

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

// Classify a part as "reasoning", "web_search", or a generic tool
type PartKind =
  | { kind: "reasoning"; part: ReasoningPartLike }
  | { kind: "web_search"; part: ToolPartLike; toolName: string }
  | { kind: "tool"; part: ToolPartLike; toolName: string }
  | { kind: "text"; text: string }
  | { kind: "skip" };

function isInteractiveDecisionToolPart(part: ToolPartLike): boolean {
  const toolName = getToolName(part);
  return toolName === "requestDecision" || toolName === "requestFeedback";
}

function isInteractiveDecisionToolResolved(part: ToolPartLike): boolean {
  const toolName = getToolName(part);
  if (toolName === "requestDecision") {
    return parseDecisionResolution(part.output) !== null;
  }
  if (toolName === "requestFeedback") {
    return parseFeedbackResolution(part.output) !== null;
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
    return isWebSearch
      ? { kind: "web_search", part, toolName }
      : { kind: "tool", part, toolName };
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
        isSubAgentDelegationTool(part, toolName) && "max-w-none"
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

  // Classify all parts
  const classified = parts.map(classifyPart);

  // Determine which parts belong in the ChainOfThought block:
  // All reasoning + tool parts that appear before the last text region.
  // Text parts and subsequent tool parts are rendered inline below.
  const thoughtParts: Array<{ index: number; kind: PartKind }> = [];
  const textParts: Array<{ index: number; text: string }> = [];
  // Trailing tool parts after the last text are kept inline (e.g. approval cards)
  const trailingToolParts: Array<{
    index: number;
    part: ToolPartLike;
    toolName: string;
  }> = [];
  // agent-* delegations use SubAgentTaskToolCallCard — never a one-line thought step.
  const preTextSubAgentParts: Array<{
    index: number;
    part: ToolPartLike;
    toolName: string;
  }> = [];

  // Collect text part indices to determine "last text" boundary
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
      (c.kind === "tool" || c.kind === "web_search") &&
      isInteractiveDecisionToolPart(c.part)
    ) {
      // When this chooser is shown in the docked surface above the composer,
      // skip its inline copy so the HITL surface appears exactly once.
      const isDocked =
        dockedInterruptToolCallId != null &&
        c.part.toolCallId === dockedInterruptToolCallId;
      if (!(isInteractiveDecisionToolResolved(c.part) || isDocked)) {
        trailingToolParts.push({
          index: i,
          part: c.part,
          toolName: c.toolName,
        });
      }
      continue;
    }

    if (
      (c.kind === "tool" || c.kind === "web_search") &&
      isSubAgentDelegationTool(c.part, c.toolName)
    ) {
      if (i <= lastTextIndex || lastTextIndex === -1) {
        preTextSubAgentParts.push({
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

    // Reasoning and tool parts: goes into thought block if before last text,
    // or if there's no text at all yet (still streaming)
    if (i <= lastTextIndex || lastTextIndex === -1) {
      thoughtParts.push({ index: i, kind: c });
    } else if (c.kind === "tool" || c.kind === "web_search") {
      // After last text — keep inline (approval cards etc.)
      trailingToolParts.push({
        index: i,
        part: c.part,
        toolName: c.toolName,
      });
    }
  }

  const citations = useCitations(textParts, parts);

  const rewrittenTextParts = useMemo(
    () =>
      textParts.map((tp) => {
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
        return { ...tp, text };
      }),
    [textParts, citations]
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
      if (kind.kind === "tool" || kind.kind === "web_search") {
        const state = getToolState(kind.part);
        return state === "running" || state === "pending";
      }
      return false;
    });

  const showChainOfThought = toolThoughtParts.length > 0;

  return (
    <>
      {msg.role === "user" ? <CopilotAttachmentPreview parts={parts} /> : null}

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

      {preTextSubAgentParts.map(({ index, part, toolName }) =>
        renderToolCallCardRow({
          index,
          msgId: msg.id,
          part,
          subAgentFullViewLabel,
          subAgentSectionLabels,
          threadId,
          toolCardDensity,
          toolName,
        })
      )}

      {rewrittenTextParts.map(({ index, text }) => (
        <MessageResponse key={`${msg.id}-${index}`}>{text}</MessageResponse>
      ))}

      <SourceCitations citations={citations} />

      {trailingToolParts.map(({ index, part, toolName }) =>
        renderToolCallCardRow({
          index,
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
