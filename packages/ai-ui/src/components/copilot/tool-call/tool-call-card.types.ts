"use client";

import type { HTMLAttributes } from "react";
import type { SubAgentRunSectionLabels } from "../sub-agent-run/sub-agent-run-sections.js";

export type ToolCallState = "pending" | "running" | "completed" | "error";

export type ToolCallCardDensity = "default" | "compact";

export interface ToolCallCardProps extends HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  /** `compact`: single-line row; details open in a popover (for button / shortcut copilot runs). */
  density?: ToolCallCardDensity;
  /** Human-readable row label from adapter normalization. */
  displayLabel?: string;
  /** AG-UI dynamic-tool failure message when `state` is error. */
  errorText?: string;
  /** Full-page sub-run monitor (`?subRun=`); omitted when unavailable. */
  fullPageHref?: string | null;
  /** Link label for {@link fullPageHref} (module i18n). */
  fullPageLabel?: string;
  input?: unknown;
  /**
   * True when this tool call was produced by a run that streamed in this page
   * session, false for a transcript replayed from storage. Cards that take a
   * side effect on arrival (opening a pane, navigating) must gate on it —
   * `state` cannot tell the two apart, since a tool part only reaches the
   * transcript once its output is complete.
   */
  isLiveRun?: boolean;
  /** Optional muted suffix on the row (path, query snippet, etc.). */
  metadata?: string;
  output?: unknown;
  /** Inline sync sub-agent log lines from stream chunks (not background tasks). */
  progressLines?: string[];
  /** Registry lookup key after wrapper unwrapping (dot syntax when available). */
  resolvedToolName?: string;
  state?: ToolCallState;
  /** Input / output / log section titles on sub-agent delegation cards. */
  subAgentSectionLabels?: SubAgentRunSectionLabels;
  toolCallId?: string;
  toolName: string;
}
