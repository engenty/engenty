// Still named AgentSessionStatus in @engenty/ai-core — that contract's own
// rename is a separate, cross-package slice of the thread/run rename.
import type { AgentSessionStatus } from "@engenty/ai-core";

export type { AgentSessionStatus } from "@engenty/ai-core";

export type ThreadPrincipalType = "user" | "group";

export type ThreadParticipantRole = "owner" | "member" | "viewer";

/**
 * `signal` is Mastra's state/notification signal, not a conversation turn.
 * Mastra reconstructs signals with a hard `role === "signal"` filter, so the
 * role must survive the round trip — but transcripts must exclude it.
 */
export type ThreadMessageRole =
  | "system"
  | "user"
  | "assistant"
  | "tool"
  | "signal";

export interface ThreadRow {
  agent_id: string;
  archived_at: string | null;
  created_at: string;
  created_by_user_id: string;
  id: string;
  metadata: Record<string, unknown>;
  route_context: Record<string, unknown>;
  status: AgentSessionStatus;
  summary: string | null;
  tenant_id: string;
  title: string | null;
  updated_at: string;
  workspace_key: string | null;
}

export interface ThreadMessageRow {
  author_user_id: string | null;
  created_at: string;
  id: string;
  /**
   * Mastra `content.metadata` verbatim — carries state-signal identity.
   * Optional because rows are also synthesized in-memory (snapshot healing,
   * placeholder assistant rows) where there is nothing to carry.
   */
  metadata?: Record<string, unknown> | null;
  parts: unknown;
  role: ThreadMessageRole;
  tenant_id: string;
  thread_id: string;
}

export type AgentRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  // Non-terminal suspend states (Phase 5 HITL): the run is parked, not finished.
  // requires_action = awaiting human input (approve/reject/answer); paused = held
  // without an outstanding request. Cleared back to running/terminal on resume.
  | "requires_action"
  | "paused";

export interface AgentRunRow {
  agent_id: string;
  cancelled_at: string | null;
  completion_tokens: number | null;
  created_by_user_id: string | null;
  error_code: string | null;
  error_message: string | null;
  finished_at: string | null;
  id: string;
  mastra_trace_id: string | null;
  metadata: Record<string, unknown>;
  model_id: string | null;
  prompt_tokens: number | null;
  started_at: string;
  status: AgentRunStatus;
  tenant_id: string;
  thread_id: string;
}

export interface AgentRunEventRow {
  created_at: string;
  event_type: string;
  id: string;
  payload: Record<string, unknown>;
  run_id: string;
  seq: number;
  tenant_id: string;
  thread_id: string;
}
