// Which slice of a thread belongs to ONE run.
//
// An agent now works a task on a standing thread — one per (task, agent) — so
// run #3 opens on what runs #1 and #2 already learned. That is the point of the
// thread; it is not what a RUN card should show. "Details anzeigen" on run #1
// must show run #1, not the whole working history, or every card in the run
// list renders the same transcript.
//
// The partition is by run START, not by `finished_at`: checkout is exclusive,
// so a task's runs never overlap, and a message belongs to the newest run that
// had started when it was written. Using `finished_at` as the upper bound would
// clip whatever the run wrote between its last save and its release.
import type { TaskRun } from "../../src/schema/types.js";

export interface RunTranscriptWindow {
  /** When the NEXT run checked out — exclusive. Null while this is the newest. */
  endAt: string | null;
  /** When this run checked the task out — inclusive. */
  startAt: string;
}

/** Timestamps are ISO-8601 from the same server clock, so string order is time order. */
function byCreatedAt(a: TaskRun, b: TaskRun): number {
  return a.created_at.localeCompare(b.created_at);
}

/**
 * The window a run owns on its thread, or null when the run is not in the list
 * (nothing to bound it against — the caller shows the thread unfiltered).
 */
export function resolveRunTranscriptWindow(
  runs: readonly TaskRun[],
  runId: string
): RunTranscriptWindow | null {
  const ordered = [...runs].sort(byCreatedAt);
  const index = ordered.findIndex((run) => run.agent_session_run_id === runId);
  const run = ordered[index];
  if (!run) {
    return null;
  }
  // Runs that share a thread are the ones that share an ACTOR. A reassigned
  // task keeps its earlier runs in the list, and those wrote to a different
  // thread — bounding against them would cut the window short for no reason.
  const successor = ordered
    .slice(index + 1)
    .find((later) => later.agent_thread_id === run.agent_thread_id);
  return {
    endAt: successor?.created_at ?? null,
    startAt: run.created_at,
  };
}

function readCreatedAt(message: { metadata?: unknown }): string | null {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const createdAt = (metadata as Record<string, unknown>).created_at;
  return typeof createdAt === "string" && createdAt.trim() ? createdAt : null;
}

/**
 * Keep only what was written during `window`.
 *
 * A message with no `created_at` cannot be placed, so it is KEPT: showing it
 * under the wrong run is a cosmetic error, dropping it silently loses part of
 * the record.
 */
export function filterMessagesToRunWindow<T extends { metadata?: unknown }>(
  messages: readonly T[],
  window: RunTranscriptWindow | null
): T[] {
  if (!window) {
    return [...messages];
  }
  return messages.filter((message) => {
    const createdAt = readCreatedAt(message);
    if (!createdAt) {
      return true;
    }
    if (createdAt < window.startAt) {
      return false;
    }
    return window.endAt === null || createdAt < window.endAt;
  });
}
