import type { AgentSessionStatus } from "@engenty/ai-core";

export type { AgentSessionStatus } from "@engenty/ai-core";

export type SessionPrincipalType = "user" | "group";

export type SessionParticipantRole = "owner" | "member" | "viewer";

export type SessionMessageRole = "system" | "user" | "assistant" | "tool";

export interface AgentSessionRow {
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

export interface AgentSessionMessageRow {
  author_user_id: string | null;
  created_at: string;
  id: string;
  parts: unknown;
  role: SessionMessageRole;
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

export interface AgentSessionRunRow {
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
