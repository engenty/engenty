// Still named AgentSessionStatus in @engenty/ai-core — that contract's own
// rename is a separate, cross-package slice of the thread/run rename.
import type { AgentSessionStatus } from "@engenty/ai-core";

export type { AgentSessionStatus } from "@engenty/ai-core";

export type ThreadPrincipalType = "user" | "group";

export type ThreadParticipantRole = "owner" | "member" | "viewer";

/**
 * Who may read a thread. `space`: anyone who may enter its Space — a shared
 * specialist's desk is one conversation for the whole team. `private`: the
 * people in `thread_participant` and the room's agents only.
 */
export type ThreadVisibility = "private" | "space";

/** Route-context key marking a thread opened as a room (name, purpose, members). */
export const THREAD_ROOM_KEY = "room";

/**
 * Route-context key marking a direct message: one person's private line with
 * one agent in a Space. One per person, agent and Space (a stable id), created
 * the first time it is opened, never named.
 */
export const THREAD_DM_KEY = "dm";

export function isRoomThread(
  routeContext: Record<string, unknown> | null | undefined
): boolean {
  return routeContext?.[THREAD_ROOM_KEY] === true;
}

export function isDmThread(
  routeContext: Record<string, unknown> | null | undefined
): boolean {
  return routeContext?.[THREAD_DM_KEY] === true;
}

/**
 * What a thread IS, decided in one place so every list agrees:
 * - `run`: a routine fire, a task's or a workflow's working thread — the
 *   machine's, nobody chats there;
 * - `pair`: two agents' delegated room, people read it;
 * - `room`: opened as one — named, with members;
 * - `dm`: one person's private line with an agent;
 * - `desk`: everything else an agent hosts in a Space — its one shared
 *   conversation with the team.
 */
export type ThreadKind = "desk" | "dm" | "pair" | "room" | "run";

export function threadKind(
  thread: Pick<ThreadRow, "route_context"> & {
    created_by_user_id?: string | null;
  }
): ThreadKind {
  const route = thread.route_context ?? {};
  if (route.routine_id || route.task_id || route.workflow_id) {
    return "run";
  }
  if (route.delegated === true) {
    return "pair";
  }
  if (isDmThread(route)) {
    return "dm";
  }
  if (isRoomThread(route)) {
    return "room";
  }
  return "desk";
}

/**
 * An agent's place in a room. The `host` is the thread's `agent_id` — the
 * desk that lists the room first, the memory owner, the one that answers when
 * nobody is addressed. Every other agent that may speak there is a `member`.
 */
export type ThreadAgentRole = "host" | "member";

export interface ThreadAgentRow {
  agent_id: string;
  created_at: string;
  /**
   * On a copilot member row: whose copilot sits here. A person's copilot in a
   * room is their alter ego — the room reads "Matthias' Copilot" — while the
   * conversation between the two of them stays their own.
   */
  on_behalf_of_user_id: string | null;
  role: ThreadAgentRole;
  tenant_id: string;
  thread_id: string;
}

/** How a chapter of the river was cut: on request, or on the calendar. */
export type ThreadCompactionKind = "daily" | "manual" | "weekly";

/** A space whose turns a chapter covers — the id, and the key the URL showed. */
export interface ThreadCompactionSpace {
  id: string;
  key: string | null;
}

/** One thing to keep in mind after a chapter, and where it came up. */
export interface ThreadCompactionNote {
  space_key: string | null;
  text: string;
}

/**
 * A chapter of a person's river: a stretch of their one copilot conversation,
 * summarised once and kept — with the spaces it happened in and what is worth
 * remembering afterwards (migration 20260921170000_copilot_river.sql).
 */
export interface ThreadCompactionRow {
  created_at: string;
  id: string;
  keep_in_mind: ThreadCompactionNote[];
  kind: ThreadCompactionKind;
  message_count: number;
  range_end: string;
  range_start: string;
  spaces: ThreadCompactionSpace[];
  summary: string;
  tenant_id: string;
  thread_id: string;
  title: string;
  user_id: string;
}

/**
 * A person's place in a room: the `owner` opened it (or the room was opened
 * for them by an agent); everyone else who was added or posted is a `member`.
 */
export interface ThreadUserParticipantRow {
  role: ThreadParticipantRole;
  user_id: string;
}

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
  /**
   * Null on an UNATTENDED thread — a routine fire or a task run has no human
   * author, and stamping one would make its transcript a private chat the
   * service principal executing the run is then refused from
   * (`registerActionRun`, and the "Four rooms" rule in thread-access.ts).
   * Typed `string` for a long time, which is why nothing warned about the
   * author-less case in either the listing path or the access path.
   */
  created_by_user_id: string | null;
  id: string;
  metadata: Record<string, unknown>;
  route_context: Record<string, unknown>;
  /**
   * The space this chat lives in (PLAN-spaces.md Phase C2). Null means
   * "pre-space" — the thread predates the column and shows only under "All
   * spaces". Visibility, not authorization: what an agent may reach is decided
   * by the capability system and the space mount set.
   */
  space_id: string | null;
  status: AgentSessionStatus;
  summary: string | null;
  tenant_id: string;
  title: string | null;
  updated_at: string;
  visibility: ThreadVisibility;
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

/** How a run started. Null means unknown, never a guess. */
export type AgentRunTrigger =
  | "message"
  | "command"
  | "button"
  | "cron"
  | "hook"
  | "direct"
  // A work item was assigned to a specialist, so a run opened against it. The
  // task is the run's SUBJECT, not its owner.
  | "task";

export interface AgentRunRow {
  agent_id: string;
  cancelled_at: string | null;
  completion_tokens: number | null;
  /**
   * Input tokens of the run's LAST step — context-window occupancy. Null when
   * the lane could not observe per-step usage; `prompt_tokens` (the sum across
   * steps) is the fallback.
   */
  context_prompt_tokens: number | null;
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
  /** How the run started; null on rows written before the column existed. */
  trigger: AgentRunTrigger | null;
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
