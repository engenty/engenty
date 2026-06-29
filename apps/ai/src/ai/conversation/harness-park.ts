// Park a suspended Harness in-process (Phase 3.2 HITL) so the resume POST can
// reattach and call `respondToToolSuspension`. Mirrors the prior agent
// park: a frontend tool suspends the run (`tool_suspended`), and the suspended
// state lives in the Harness instance — so we keep it alive (15-min TTL, unref'd)
// keyed by the suspended run id. A server restart loses it → the resume surfaces a
// clear RUN_ERROR (the suspended state was in-memory).
import type { FrontendToolDefinition } from "@engenty/ag-ui-bridge";
import type { Harness } from "@mastra/core/harness";

const PARKED_TTL_MS = 15 * 60 * 1000;

interface ParkedHarness {
  harness: Harness;
  // Frontend tool definitions for this run — kept so a resumed leg that suspends
  // AGAIN (a second frontend tool in the same turn) can build the next interrupt.
  mergedDefinitions: readonly FrontendToolDefinition[];
  threadId: string;
  timer: ReturnType<typeof setTimeout>;
}

const parkedHarnesses = new Map<string, ParkedHarness>();

export function parkHarnessRun(
  runId: string,
  harness: Harness,
  threadId: string,
  mergedDefinitions: readonly FrontendToolDefinition[]
): void {
  // A re-park (second suspend in one turn) replaces the prior entry/timer.
  const existing = parkedHarnesses.get(runId);
  if (existing) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    const parked = parkedHarnesses.get(runId);
    parkedHarnesses.delete(runId);
    void parked?.harness.destroy().catch(() => {
      // best-effort cleanup on TTL expiry
    });
  }, PARKED_TTL_MS);
  (timer as { unref?: () => void }).unref?.();
  parkedHarnesses.set(runId, { harness, mergedDefinitions, threadId, timer });
}

export function takeParkedHarnessRun(runId: string): ParkedHarness | undefined {
  const parked = parkedHarnesses.get(runId);
  if (!parked) {
    return;
  }
  clearTimeout(parked.timer);
  parkedHarnesses.delete(runId);
  return parked;
}
