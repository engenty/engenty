"use client";

// The specialist's own work, found from the room you are watching it in.
//
// A routine fire is a RUN in its own unattended thread (work-model.md), so the
// chat someone has open belongs to a DIFFERENT thread: while the agent works
// that chat shows nothing at all, and the fire only becomes visible once it is
// over and its thread turns up in the desk feed. This hook is the missing
// signal. It finds the agent's in-flight unattended run, names the routine
// behind it, and HOLDS it through its terminal state — a run leaves the
// in-flight list at exactly the moment the person needs to be told how it went.

import { useQuery } from "@engenty/query-client";
import { useEffect, useState } from "react";
import { resolveEngentyAiServiceBaseUrl } from "../../ag-ui/apps-ai/apps-ai-api.js";
import { getAppsAiThread } from "../../ag-ui/apps-ai/apps-ai-thread-api.js";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import { getAiSessionRuns, listAgentRuns } from "../../lib/runtime/runs-api.js";

/**
 * How often the lane looks for work it was never told about. Nothing pushes
 * "a routine started" to the browser — the fire happens on a scheduler tick
 * with nobody at the keyboard. Once a run is found its SSE stream carries
 * every step, so this interval only decides how late the FIRST line appears.
 */
const DISCOVERY_INTERVAL_MS = 10_000;

/** Runs to look at: the newest handful, so a busy agent still discovers one. */
const DISCOVERY_LIMIT = 5;

const IN_FLIGHT_STATUS: ReadonlySet<string> = new Set(["queued", "running"]);

export interface AgentRoutineActivity {
  /** The routine this fire belongs to. */
  routineId: string;
  runId: string;
  threadId: string;
  /** The routine's name — its run thread is titled with it. Null until read. */
  title: string | null;
}

/**
 * The newest run nobody typed, while it is still going.
 *
 * `trigger: "message"` is a person in a chat and the lane already streams
 * those; everything else — a schedule tick, a press, a delegated job — is work
 * the agent started without being asked in this room.
 */
export function pickUnattendedRunInFlight(
  runs: readonly AiAgentRunSummary[]
): AiAgentRunSummary | null {
  for (const run of runs) {
    if (run.trigger !== "message" && IN_FLIGHT_STATUS.has(run.status)) {
      return run;
    }
  }
  return null;
}

/** A run thread names its routine here — the same key `canAccessThread` reads. */
export function readRoutineId(
  routeContext: Record<string, unknown> | null | undefined
): string | null {
  const value = routeContext?.routine_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function useAgentRoutineActivity(input: {
  agentId: string;
  enabled?: boolean;
}): AgentRoutineActivity | null {
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl();
  const enabled = (input.enabled ?? true) && Boolean(input.agentId);
  const runsQuery = useQuery({
    enabled,
    queryFn: ({ signal }) =>
      listAgentRuns(input.agentId, { limit: DISCOVERY_LIMIT, signal }),
    queryKey: ["ai", "agent-runs", "unattended", input.agentId],
    refetchInterval: DISCOVERY_INTERVAL_MS,
  });
  const inFlight = runsQuery.data
    ? pickUnattendedRunInFlight(runsQuery.data.runs)
    : null;
  const inFlightRunId = inFlight?.id ?? null;
  const inFlightThreadId = inFlight?.thread_id ?? null;

  // Held rather than derived, so the card survives the run that produced it.
  // Released only when a NEWER unattended run starts.
  const [held, setHeld] = useState<{
    runId: string;
    threadId: string;
  } | null>(null);
  useEffect(() => {
    if (!(inFlightRunId && inFlightThreadId)) {
      return;
    }
    setHeld((current) =>
      current?.runId === inFlightRunId
        ? current
        : { runId: inFlightRunId, threadId: inFlightThreadId }
    );
  }, [inFlightRunId, inFlightThreadId]);

  const heldThreadId = held?.threadId ?? null;
  const threadQuery = useQuery({
    enabled: enabled && Boolean(serviceBaseUrl && heldThreadId),
    queryFn: ({ signal }) =>
      getAppsAiThread({
        serviceBaseUrl: serviceBaseUrl as string,
        signal,
        threadId: heldThreadId as string,
      }),
    // The routine's name does not change under a running fire.
    queryKey: ["ai", "thread", heldThreadId, "routine-activity"],
    staleTime: Number.POSITIVE_INFINITY,
  });

  // No routine on the thread means this run is not a fire — a press or a
  // delegated job, which the room it was started from already reports.
  const routineId = readRoutineId(threadQuery.data?.route_context);

  // A graph-backed fire is ONE parent workflow run whose steps each spawn a
  // delegated child run of this agent — and the children are what discovery
  // sees. Reporting each child would make one fire read as the routine
  // restarting every few minutes, and a child's green finish can mask a
  // parent that failed right after. So the card follows the fire's ROOT: the
  // newest workflow run in the fire's thread. A prose routine has no
  // workflow run there and keeps the discovered run.
  const rootQuery = useQuery({
    enabled: enabled && Boolean(serviceBaseUrl && heldThreadId && routineId),
    queryFn: ({ signal }) =>
      getAiSessionRuns(heldThreadId as string, { limit: 50, signal }),
    // Re-resolved per discovered run: the next fire reuses the same standing
    // thread, and its children must find THEIR parent, not the last one's.
    queryKey: ["ai", "thread-runs", "fire-root", heldThreadId, held?.runId],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const rootRun = rootQuery.data
    ? [...rootQuery.data.runs]
        .reverse()
        .find((run) => run.agent_id?.startsWith("workflow:"))
    : undefined;

  if (!(held && routineId)) {
    return null;
  }
  return {
    routineId,
    runId: rootRun?.id ?? held.runId,
    threadId: held.threadId,
    title: threadQuery.data?.title?.trim() || null,
  };
}
