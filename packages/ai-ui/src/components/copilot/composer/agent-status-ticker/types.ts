import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";

/** UX outcome for the agent **run** / ticker (icons, colors). */
export type AgentRunOutcomeState =
  | "requested"
  | "running"
  | "stale"
  | "success"
  | "error";

/** Current **step** segment within the assistant turn (last matching part wins). */
export type AgentStepKind = "idle" | "tool";

export type AgentStatusTickerVariant =
  | "muted"
  | "active"
  | "success"
  | "destructive";

/** Optional orchestrator run status for outcome hints (snake_case values). */
export type AgentRunStatus =
  | "cancelled"
  | "failed"
  | "queued"
  | "running"
  | "succeeded"
  | "timed_out"
  | "waiting_for_approval"
  | "waiting_for_input";

export interface AgentStatusTickerLabels {
  /** Accessible label for collapsing recent steps */
  collapseSteps: string;
  /** The run finished. */
  done: string;
  /** The run failed without a message of its own. */
  error: string;
  /** Accessible label for expanding recent steps */
  expandSteps: string;
  /** The stream broke without saying why. */
  somethingWentWrong: string;
  /** The client fell behind the server. */
  stale: string;
  /** Shown when streaming/submitted but no step label yet */
  thinking: string;
  /** Shown when waiting for first assistant message in this turn */
  waiting: string;
}

/** One derived step segment from assistant message parts (newest-first in lists). */
export interface AgentStatusStep {
  fullLabel: string;
  kind: AgentStepKind;
  label: string;
}

export interface AgentStatusTickerSnapshot {
  /** Whether the ticker can expand to show additional recent steps. */
  canExpandSteps: boolean;
  /** Full string for `title` / tooltips (whitespace normalized). */
  fullLabel: string;
  /** Single-line display (truncated by host CSS). */
  label: string;
  outcome: AgentRunOutcomeState;
  /** Recent step segments within the current turn, newest first. */
  recentSteps: readonly AgentStatusStep[];
  showSpinner: boolean;
  /** Latest visible tool step within the current turn. */
  stepKind: AgentStepKind;
  variant: AgentStatusTickerVariant;
}

export interface DeriveAgentStatusTickerInput {
  /** Assistant activity signature captured when the current run started. */
  activityBaselineSignature?: string | null;
  chatStatus: "ready" | "streaming" | "submitted" | "error" | string;
  errorMessage?: string | null;
  labels: AgentStatusTickerLabels;
  messages: readonly AgentTurnMessageLike[];
  runStatus?: AgentRunStatus | null;
  /** When true, forces outcome `stale` (disconnect, server ahead of client, etc.). */
  stale?: boolean;
}
