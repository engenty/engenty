import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";

/** Where the current agent **turn** sits in the coarse lifecycle (v1 maps from chat + assistant presence). */
export type AgentTurnPhase =
  | "requested"
  | "run_start"
  | "turn_start"
  | "turn_end"
  | "run_end";

/** UX outcome for the agent **run** / ticker (icons, colors). */
export type AgentRunOutcomeState =
  | "requested"
  | "running"
  | "stale"
  | "success"
  | "error";

/** Current **step** segment within the assistant turn (last matching part wins). */
export type AgentStepKind = "idle" | "text" | "tool" | "reasoning" | "progress";

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
  collapseSteps?: string;
  /** Accessible label for expanding recent steps */
  expandSteps?: string;
  /** Shown when streaming/submitted but no step label yet */
  thinking?: string;
  /** Shown when waiting for first assistant message in this turn */
  waiting?: string;
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
  phase: AgentTurnPhase;
  /** Recent step segments within the current turn, newest first. */
  recentSteps: readonly AgentStatusStep[];
  showShimmer: boolean;
  showSpinner: boolean;
  /** Latest visible agentic step (tool, text, …) within the current turn. */
  stepKind: AgentStepKind;
  variant: AgentStatusTickerVariant;
}

export interface DeriveAgentStatusTickerInput {
  /** Assistant activity signature captured when the current run started. */
  activityBaselineSignature?: string | null;
  chatStatus: "ready" | "streaming" | "submitted" | "error" | string;
  errorMessage?: string | null;
  labels?: AgentStatusTickerLabels;
  messages: readonly AgentTurnMessageLike[];
  runStatus?: AgentRunStatus | null;
  /** When true, forces outcome `stale` (disconnect, server ahead of client, etc.). */
  stale?: boolean;
  /** Composer status flap: show run state only — never duplicate transcript text. */
  statusOnly?: boolean;
}
