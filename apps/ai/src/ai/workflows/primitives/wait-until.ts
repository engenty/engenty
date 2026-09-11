// `wait_until` — a long wait that survives a restart.
//
// WHY THIS EXISTS RATHER THAN `sleep`.
//
// Mastra's declarative `sleep` / `sleepUntil` entries are real, but the default
// execution engine awaits them IN-PROCESS: `executeSleep` calls
// `engine.executeSleepDuration(duration)`, and the `suspend` handed to a
// dynamic sleep `fn` is an explicit no-op. So a sleeping run is held open by a
// live process — fine for seconds, fatal for "chase this in five days", which
// the next deploy would strand with no timer to re-arm. That is why the
// validator caps raw `sleep` at MAX_SLEEP_MS.
//
// A long wait therefore has to be a SUSPENSION, not a sleep. This primitive
// reuses exactly the mechanism the Phase-0 spike proved for approval gates: a
// declarative `tool` entry receives the workflow's `suspend`, and the suspend
// payload lands durably in the Mastra pg snapshot. Nothing is held in memory —
// the process can die, deploy, and come back, and the run is still parked
// precisely here.
//
// What re-arms it is `wake-sweep.ts`, driven by the `graph-wake` system job:
// `workflow_run.wake_at` is the durable timer, the snapshot is the durable
// program counter, and the sweep is the thing that puts them back together.
//
// The difference from an approval gate is only WHO resumes it — a person there,
// the clock here — so a waiting run is `sleeping`, never `requires_action`, and
// it must not appear in the inbox as an outstanding decision.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createWorkflowRunStoreFromEnv } from "../../index.js";
import { WAIT_UNTIL_PRIMITIVE_ID } from "../primitive-ids.js";
import { readGraphRunContext } from "../run-context.js";

export { WAIT_UNTIL_PRIMITIVE_ID } from "../primitive-ids.js";

const inputSchema = z.object({
  /**
   * Absolute wake time (ISO 8601). Takes precedence over `duration_ms` — a
   * graph that says "the 1st of next month" means a date, not an offset that
   * drifts with when the run happened to reach this node.
   */
  until: z.string().datetime().optional(),
  /** Relative wait in milliseconds, measured from when this node is reached. */
  duration_ms: z.number().int().positive().optional(),
  /**
   * Human label for the canvas and the run list: "waiting for the customer to
   * reply". Explains the pause to someone who finds the run parked.
   */
  reason: z.string().max(200).optional(),
});

const outputSchema = z.object({
  /** When the run actually resumed — may be later than planned if the sweep lagged. */
  woke_at: z.string(),
  /** The wake time this node asked for, for auditing drift. */
  wake_at: z.string(),
});

const suspendSchema = z.object({
  kind: z.literal("wait"),
  wake_at: z.string(),
  reason: z.string().optional(),
  request_id: z.string(),
});

const resumeSchema = z.object({
  woke_at: z.string().optional(),
});

/** Resolve the requested wake time. Absolute beats relative; both may be absent. */
function resolveWakeAt(input: {
  duration_ms?: number;
  until?: string;
}): Date | null {
  if (input.until) {
    const at = new Date(input.until);
    return Number.isNaN(at.getTime()) ? null : at;
  }
  if (typeof input.duration_ms === "number") {
    return new Date(Date.now() + input.duration_ms);
  }
  return null;
}

export function createWaitUntilPrimitive() {
  return createTool({
    id: WAIT_UNTIL_PRIMITIVE_ID,
    description:
      "Park the run until a given time, durably. The run is suspended (not " +
      "held in memory) and resumed by the wake sweep, so it survives restarts.",
    inputSchema,
    outputSchema,
    suspendSchema,
    resumeSchema,
    execute: async (input, ctx) => {
      const workflow = ctx.workflow;
      if (!workflow) {
        throw new Error(
          "graph-action: wait_until ran outside a workflow — no suspend available"
        );
      }
      const runCtx = readGraphRunContext(ctx.requestContext);

      // Resume path first: the same tool re-executes with resumeData set once
      // the sweep wakes it (same contract the approval gate relies on).
      const resumed = workflow.resumeData;
      if (resumed) {
        const wokeAt = resumed.woke_at ?? new Date().toISOString();
        return { woke_at: wokeAt, wake_at: wokeAt };
      }

      const wakeAt = resolveWakeAt(input);
      if (!wakeAt) {
        throw new Error(
          "graph-action: wait_until needs a constant `until` (ISO date) or `duration_ms`"
        );
      }

      // A wake time already in the past is a no-op, not an error: a graph that
      // says "wait until the due date" is legitimately reached late. Falling
      // through beats parking a run the sweep would wake on its very next tick.
      const now = Date.now();
      if (wakeAt.getTime() <= now) {
        const stamp = new Date(now).toISOString();
        return { woke_at: stamp, wake_at: wakeAt.toISOString() };
      }

      // Record the durable timer BEFORE suspending. The snapshot alone says
      // "parked"; only `wake_at` says "parked until Thursday", and the sweep
      // can only find runs that carry it. Written first so a crash between the
      // two leaves a findable run rather than one asleep forever.
      await createWorkflowRunStoreFromEnv()?.setStatus({
        id: runCtx.requestId,
        status: "sleeping",
        tenantId: runCtx.tenantId,
        wakeAt: wakeAt.toISOString(),
      });

      await workflow.suspend({
        kind: "wait" as const,
        request_id: runCtx.requestId,
        wake_at: wakeAt.toISOString(),
        ...(input.reason ? { reason: input.reason } : {}),
      });

      // Not reached — the engine marks the run suspended and discards this.
      // Present so the types close and a suspend-less engine fails loudly
      // rather than silently skipping the wait.
      const stamp = new Date().toISOString();
      return { woke_at: stamp, wake_at: wakeAt.toISOString() };
    },
  });
}
