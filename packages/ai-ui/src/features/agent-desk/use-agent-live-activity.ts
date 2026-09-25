"use client";

// What an agent is doing right now, for the rows that list it.
//
// A desk row says when its conversation last moved — which is silent about
// the thing people actually want to know while they wait: is it working, or
// is it stuck on a question only they can answer. Runs carry both (`running`
// while it works, `requires_action` while it is parked on an ask), so the
// tenant's run feed is polled and folded to one state per agent. One query
// for every row: React Query shares it, so a sidebar of ten desks polls once.

import {
  keepPreviousData,
  staggeredRefetchInterval,
  useQuery,
} from "@engenty/query-client";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import { listTenantRuns } from "../../lib/runtime/runs-api.js";

/** Working, or parked on something only a person can answer. */
export type AgentLiveActivity = "needs_input" | "working";

/** Nothing pushes a background run to the browser, so the feed is polled. */
export const AGENT_LIVE_ACTIVITY_POLL_MS = 5000;
/** Quiet desks do not need a 5s tick — that overlapped Space home. */
export const AGENT_LIVE_ACTIVITY_IDLE_POLL_MS = 30_000;

const LIVE_ACTIVITY_POLL_SALT = "agent-live-activity";

/** Runs to look at — the newest of the tenant, across every space. */
const FEED_LIMIT = 60;

const WORKING_STATUS: ReadonlySet<string> = new Set(["queued", "running"]);
const NEEDS_INPUT_STATUS: ReadonlySet<string> = new Set([
  "requires_action",
  "waiting_for_approval",
  "waiting_for_input",
]);

/** When a run happened, for picking the newest in its lane. */
function runOrder(run: AiAgentRunSummary): number {
  const at = Date.parse(run.started_at ?? run.created_at);
  return Number.isFinite(at) ? at : 0;
}

/**
 * One state per agent, from the NEWEST run in each of its conversations.
 *
 * A parked run is never cleared: `requires_action` is how a run ends when it
 * suspends on a question, and the row stays that way for good even after the
 * conversation has moved on and finished something else. Reading every run in
 * the feed therefore left desks saying "Wartet auf dich" about an ask from
 * days ago that nobody can answer any more.
 *
 * So each conversation is judged by its own latest run — a thread that has
 * since completed is not waiting on anybody — and the agent takes the most
 * urgent of its conversations. An ask still outranks work in progress: the
 * agent may well be running a second job, but the one the person can do
 * something about wins.
 */
export function agentLiveActivityByAgent(
  runs: readonly AiAgentRunSummary[]
): Map<string, AgentLiveActivity> {
  // A lane is one agent in one conversation. A run with no thread is its own
  // lane: nothing later can speak for it.
  const newestByLane = new Map<string, AiAgentRunSummary>();
  for (const run of runs) {
    if (!run.agent_id) {
      continue;
    }
    const lane = `${run.agent_id}\u0000${run.thread_id ?? run.id}`;
    const seen = newestByLane.get(lane);
    if (!seen || runOrder(run) > runOrder(seen)) {
      newestByLane.set(lane, run);
    }
  }

  const byAgent = new Map<string, AgentLiveActivity>();
  for (const run of newestByLane.values()) {
    if (NEEDS_INPUT_STATUS.has(run.status)) {
      byAgent.set(run.agent_id, "needs_input");
      continue;
    }
    if (
      WORKING_STATUS.has(run.status) &&
      byAgent.get(run.agent_id) !== "needs_input"
    ) {
      byAgent.set(run.agent_id, "working");
    }
  }
  return byAgent;
}

export function agentLiveActivityPollMs(
  runs: readonly AiAgentRunSummary[] | undefined
): number | false {
  const live = agentLiveActivityByAgent(runs ?? []).size > 0;
  return staggeredRefetchInterval(
    live ? AGENT_LIVE_ACTIVITY_POLL_MS : AGENT_LIVE_ACTIVITY_IDLE_POLL_MS,
    LIVE_ACTIVITY_POLL_SALT
  );
}

export function useAgentLiveActivityMap(
  enabled = true
): ReadonlyMap<string, AgentLiveActivity> {
  const query = useQuery({
    enabled,
    queryFn: ({ signal }) => listTenantRuns({ limit: FEED_LIMIT, signal }),
    queryKey: ["ai", "agent-runs", "live-activity"],
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      agentLiveActivityPollMs(
        (query.state.data as { runs?: AiAgentRunSummary[] } | undefined)?.runs
      ),
    refetchIntervalInBackground: false,
    select: (data) => agentLiveActivityByAgent(data.runs),
  });
  return query.data ?? EMPTY_ACTIVITY;
}

const EMPTY_ACTIVITY: ReadonlyMap<string, AgentLiveActivity> = new Map();

/** The same feed, asked about one agent — what a sidebar row needs. */
export function useAgentLiveActivity(
  agentId: string | null | undefined
): AgentLiveActivity | null {
  const byAgent = useAgentLiveActivityMap(Boolean(agentId));
  return agentId ? (byAgent.get(agentId) ?? null) : null;
}
