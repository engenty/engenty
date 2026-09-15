// What a Space's home says about one conversation (PLAN-space-home.md §3).
//
// A row earns a card by being in a live state, never by a timestamp — "last
// active three days ago" is not a state and the page never renders it. The
// five states are ordered by urgency, and a conversation is in exactly one:
// the most urgent of its jobs.
//
// Pure on purpose: the route reads threads and runs, this decides, and the
// test pins the decision without a database.

import {
  type AgUiOpenInterruptMetadata,
  isAgUiOpenInterruptExpired,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import { HIRE_WELCOME_SOURCE } from "../hire/hire-welcome-text.js";
import { readRoomTurnState } from "../rooms/room-turns.js";

/** Ordered by urgency — `SPACE_HOME_STATE_RANK` below depends on this order. */
export type SpaceHomeState =
  | "waiting"
  | "paused"
  | "running"
  | "done"
  | "quiet";

const SPACE_HOME_STATE_RANK: Record<SpaceHomeState, number> = {
  waiting: 0,
  paused: 1,
  running: 2,
  done: 3,
  quiet: 4,
};

export function compareSpaceHomeState(
  left: SpaceHomeState,
  right: SpaceHomeState
): number {
  return SPACE_HOME_STATE_RANK[left] - SPACE_HOME_STATE_RANK[right];
}

/** A run in a status that is neither terminal nor a parked request. */
const RUNNING_STATUSES = new Set(["running", "paused"]);
/** Parked on a person: native HITL suspend (`requires_action`). */
const WAITING_STATUSES = new Set(["requires_action"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export interface SpaceHomeRunInput {
  agent_id: string;
  finished_at: string | null;
  id: string;
  metadata?: Record<string, unknown> | null;
  started_at: string;
  status: string;
  thread_id: string;
  trigger: string | null;
}

export interface SpaceHomeMessageInput {
  created_at: string;
  metadata?: Record<string, unknown> | null;
  parts: unknown;
  role: string;
}

export interface SpaceHomeThreadInput {
  agent_id: string;
  /**
   * App versions announced in this thread that are STILL proposed. The route
   * filters them against core; this stays pure and simply believes the list.
   */
  app_releases?: readonly SpaceHomeAppRelease[];
  id: string;
  last_message?: SpaceHomeMessageInput | null;
  metadata: Record<string, unknown>;
  route_context: Record<string, unknown>;
  title: string | null;
  updated_at: string;
}

/**
 * An App version built and waiting to be activated.
 *
 * Not an interrupt and not a run: `apps.approve` is a plain decision on the
 * App itself, so the card can take it without opening the conversation — the
 * one verdict the home owns end to end besides a room's continue.
 */
export interface SpaceHomeAppRelease {
  app_id: string;
  artifact_id: string;
  name: string;
  version: number;
}

/** One live thing a conversation is doing. A card renders one row per job. */
export interface SpaceHomeJob {
  /** Set when this job IS an App waiting for approval. */
  app_release: SpaceHomeAppRelease | null;
  finished_at: string | null;
  /**
   * The open interrupt, when this job is parked on a person. Carried whole so
   * the card can name the tool and quote the question without a second fetch.
   */
  interrupt: {
    /** What the interrupt points at, when it produced something to look at. */
    artifact_id: string | null;
    body: string | null;
    kind: string | null;
    title: string | null;
    tool_name: string | null;
  } | null;
  run_id: string | null;
  started_at: string | null;
  state: SpaceHomeState;
  trigger: string | null;
}

/** The newest thing said in a conversation, short enough for one card line. */
export interface SpaceHomeLastMessage {
  at: string;
  excerpt: string;
  role: string;
}

export interface SpaceHomeThreadState {
  agent_id: string;
  agent_turns: number;
  /**
   * The hire's opening is the only thing said so far — keep a card on the
   * home until a person answers, instead of collapsing it into Inactive.
   */
  awaiting_first_reply: boolean;
  jobs: SpaceHomeJob[];
  last_message: SpaceHomeLastMessage | null;
  paused: boolean;
  state: SpaceHomeState;
  thread_id: string;
  title: string | null;
  updated_at: string;
}

/** How much of a message a card line can carry before it stops being a line. */
const EXCERPT_MAX = 240;

function partsToText(parts: unknown): string {
  if (typeof parts === "string") {
    return parts;
  }
  if (!Array.isArray(parts)) {
    return "";
  }
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const record = part as { text?: unknown; type?: unknown };
    if (record.type === "text" && typeof record.text === "string") {
      texts.push(record.text);
    }
  }
  return texts.join(" ");
}

/**
 * The words of a markdown message, without its notation.
 *
 * Agents write markdown because their replies are rendered as markdown in the
 * conversation. A card is not: it clamps two lines of plain text, where
 * `**Gebaut:**` reads as four stray asterisks — and a cut at 240 characters
 * can even leave an unclosed one. So the excerpt keeps what was SAID and drops
 * what was only ever an instruction to the renderer.
 *
 * Fenced code goes entirely: a card cannot show code, and a long block would
 * eat the whole excerpt before the sentence that explains it. Emphasis with
 * `_` is left alone — snake_case tool and file names appear far more often in
 * these messages than underscored italics.
 */
export function markdownToExcerptText(markdown: string): string {
  return (
    markdown
      // Fenced code, then indented-block leftovers of it.
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/~~~[\s\S]*?~~~/g, " ")
      // `code` → code, ![alt](src) → alt, [text](href) → text.
      .replace(/`([^`]*)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Line-leading notation: headings, quotes, bullets, numbers, rules.
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}([-*+]|\d{1,9}[.)])\s+/gm, "")
      .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, " ")
      // Emphasis and strikethrough around the words themselves.
      .replace(/(\*\*\*|\*\*|\*|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
      // An asterisk run the truncation or the author left unclosed.
      .replace(/\*+/g, "")
  );
}

function lastMessageOf(
  message: SpaceHomeMessageInput | null | undefined
): SpaceHomeLastMessage | null {
  if (!message) {
    return null;
  }
  // One line: newlines are what makes a transcript a transcript, and a card is
  // not one. Tool calls and attachments carry no text and yield nothing, which
  // is better than "[object Object]".
  const text = markdownToExcerptText(partsToText(message.parts))
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return null;
  }
  return {
    at: message.created_at,
    excerpt:
      text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text,
    role: message.role,
  };
}

function awaitingFirstReply(
  message: SpaceHomeMessageInput | null | undefined
): boolean {
  return (
    message?.role === "assistant" &&
    message.metadata?.source === HIRE_WELCOME_SOURCE
  );
}

function interruptOf(
  thread: SpaceHomeThreadInput,
  nowMs: number
): AgUiOpenInterruptMetadata | null {
  const open = readAgUiOpenInterrupt(thread.metadata);
  if (!open || isAgUiOpenInterruptExpired(open, nowMs)) {
    // An expired interrupt can no longer be resumed, so a card offering its
    // buttons would be a lie. The thread falls back to its run state.
    return null;
  }
  return open;
}

function jobFromRun(
  run: SpaceHomeRunInput,
  sinceMs: number
): SpaceHomeJob | null {
  const state = runState(run, sinceMs);
  if (!state) {
    return null;
  }
  return {
    app_release: null,
    finished_at: run.finished_at,
    interrupt: null,
    run_id: run.id,
    started_at: run.started_at,
    state,
    trigger: run.trigger,
  };
}

function runState(
  run: SpaceHomeRunInput,
  sinceMs: number
): SpaceHomeState | null {
  if (WAITING_STATUSES.has(run.status)) {
    return "waiting";
  }
  if (RUNNING_STATUSES.has(run.status)) {
    return "running";
  }
  if (!TERMINAL_STATUSES.has(run.status)) {
    return null;
  }
  const finished = run.finished_at ? Date.parse(run.finished_at) : Number.NaN;
  // `done` is "finished since you last looked", so a run that ended before the
  // cursor — or one whose end we cannot date — is simply not news.
  return Number.isFinite(finished) && finished > sinceMs ? "done" : null;
}

/**
 * One conversation's state, from its thread row and the runs on it.
 *
 * `sinceMs` is the viewer's last visit to this Space: it decides `done` and
 * nothing else. A room's pause outranks everything but a person being asked
 * something, because a paused room is stuck on a word from a human too.
 */
export function resolveSpaceHomeThreadState(params: {
  nowMs: number;
  runs: readonly SpaceHomeRunInput[];
  sinceMs: number;
  thread: SpaceHomeThreadInput;
}): SpaceHomeThreadState {
  const { nowMs, sinceMs, thread } = params;
  const room = readRoomTurnState(thread.metadata);
  const open = interruptOf(thread, nowMs);
  const jobs: SpaceHomeJob[] = [];

  // An App waiting for activation goes FIRST, so that when the run it was
  // built by is also parked, the generic "Wartet auf deine Antwort" run row is
  // deduplicated away below and the card says which App and which version.
  for (const release of thread.app_releases ?? []) {
    jobs.push({
      app_release: release,
      finished_at: null,
      interrupt: null,
      run_id: null,
      started_at: null,
      state: "waiting",
      trigger: null,
    });
  }
  if (open) {
    jobs.push({
      app_release: null,
      finished_at: null,
      interrupt: {
        artifact_id: open.artifact_id,
        body: open.body ?? null,
        kind: open.kind ?? null,
        title: open.title ?? null,
        tool_name: open.tool_name ?? null,
      },
      run_id: open.run_id ?? null,
      started_at: null,
      state: "waiting",
      trigger: null,
    });
  }
  if (room.paused) {
    jobs.push({
      app_release: null,
      finished_at: null,
      interrupt: null,
      run_id: null,
      started_at: null,
      state: "paused",
      trigger: null,
    });
  }
  // One room takes one run at a time (PLAN-agent-rooms.md D6), so a thread has
  // at most one LIVE job per state — older rows in the same state are runs
  // that were parked and never cleaned up, and drawing them would repeat one
  // situation three times. Runs arrive newest first, so the first wins.
  // Finished runs are not deduplicated: the client counts them, and seven
  // things finishing overnight is seven, not one.
  const seenLive = new Set<SpaceHomeState>(jobs.map((job) => job.state));
  // A run that suspends on a question ENDS as `requires_action` and is never
  // cleared, so an old ask nobody can answer any more would keep the whole
  // conversation "waiting" for good. Runs arrive newest first: once we have
  // passed one that ended, everything older is history, not a live job.
  let sawEnded = false;
  for (const run of params.runs) {
    // The interrupt already speaks for the run it parked; two rows for one
    // situation would ask the same question twice.
    if (open?.run_id && run.id === open.run_id) {
      continue;
    }
    const job = jobFromRun(run, sinceMs);
    const ended = TERMINAL_STATUSES.has(run.status);
    if (!job) {
      sawEnded = sawEnded || ended;
      continue;
    }
    if (job.state !== "done") {
      if (sawEnded || seenLive.has(job.state)) {
        continue;
      }
      seenLive.add(job.state);
    }
    jobs.push(job);
    sawEnded = sawEnded || ended;
  }
  jobs.sort((left, right) => compareSpaceHomeState(left.state, right.state));

  return {
    agent_id: thread.agent_id,
    agent_turns: room.agentTurns,
    awaiting_first_reply: awaitingFirstReply(thread.last_message),
    jobs,
    last_message: lastMessageOf(thread.last_message),
    paused: room.paused,
    state: jobs[0]?.state ?? "quiet",
    thread_id: thread.id,
    title: thread.title,
    updated_at: thread.updated_at,
  };
}

/** The whole Space, thread by thread. Quiet threads stay in — the client
 * decides whether a quiet row is pinned (a card) or collapsed (the line). */
export function resolveSpaceHomeStates(params: {
  nowMs: number;
  runsByThread: ReadonlyMap<string, readonly SpaceHomeRunInput[]>;
  sinceMs: number;
  threads: readonly SpaceHomeThreadInput[];
}): SpaceHomeThreadState[] {
  return params.threads.map((thread) =>
    resolveSpaceHomeThreadState({
      nowMs: params.nowMs,
      runs: params.runsByThread.get(thread.id) ?? [],
      sinceMs: params.sinceMs,
      thread,
    })
  );
}
