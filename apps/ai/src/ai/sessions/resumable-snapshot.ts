// Is a suspended chat run still recoverable from Mastra's snapshot storage?
//
// `agent.listSuspendedRuns` is Mastra's storage-backed discovery API: unlike the
// in-process registry (`getActiveThreadRunId`, our park map, the run-event bus)
// it reads workflow snapshot storage, so — per Mastra's own docs — "it works
// after a server restart and across multiple server instances".
//
// Two places ask this question, for opposite reasons:
//   - resume-conversation-run's SNAPSHOT lane, before resuming: without a
//     snapshot there is nothing to continue. It asks inline — it already holds
//     an assembled agent, and calling through here would assemble a second one.
//   - the thread-load reconciler, before declaring an interrupt orphaned: an
//     interrupt whose run is still in storage is RECOVERABLE, and clearing it
//     destroys the very state the snapshot lane exists to resume. That caller
//     has no agent yet, which is what this module is for.
//
// The second is why the module exists at all: the reconciler ran FIRST and,
// judging only from in-process state, wiped every post-restart interrupt before
// the resume lane could ever see it — proven by a live kill-test 2026-08-05.
import type { Mastra } from "@mastra/core/mastra";
import type { AiRegistry } from "../registry/index.js";
import type { DynamicAgentAssembler } from "./types.js";

export interface ResumableSnapshotProbe {
  // The thread's text agent key — the snapshot carries the owning agent's id,
  // and listSuspendedRuns skips runs belonging to a different agent.
  agentId?: string | null;
  assembleAgent: DynamicAgentAssembler;
  mastra?: Mastra;
  registry?: AiRegistry;
  runId?: string | null;
  tenantId: string;
  threadId: string;
  userId: string;
}

/**
 * True when `runId` is still discoverable as a suspended run for this thread.
 *
 * Fails CLOSED (returns false) when a dependency is missing or storage errors:
 * both callers treat false as "cannot recover", which preserves the behaviour
 * each had before this probe existed rather than inventing a new failure mode.
 */
export async function hasResumableSnapshot(
  probe: ResumableSnapshotProbe
): Promise<boolean> {
  if (!(probe.registry && probe.mastra && probe.runId && probe.agentId)) {
    return false;
  }
  try {
    const agent = await probe.assembleAgent(probe.registry, probe.agentId, {
      mastra: probe.mastra,
      resolveContext: {
        tenantId: probe.tenantId,
        threadId: probe.threadId,
        userId: probe.userId,
      },
    });
    const { runs } = await agent.listSuspendedRuns({
      threadId: probe.threadId,
    });
    return runs.some((run) => run.runId === probe.runId);
  } catch (error) {
    // A storage hiccup must not wedge a thread forever: reporting "no
    // snapshot" lets the reconciler heal it, which is the safer default.
    console.error("[resumable-snapshot] probe failed:", error);
    return false;
  }
}
