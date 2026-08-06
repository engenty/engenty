// Thread-load reconciliation for a WEDGED approval/tool interrupt.
//
// A parked-kind open interrupt (frontend tool, sandbox command, or tool
// approval — those carry a `run_id`) can only be resumed while its suspended
// session is still parked in-process. A server restart, the 15-min park TTL, or
// a resume error that destroyed the session all leave the persisted
// `ag_ui_open_interrupt` pointing at a run that no longer exists: every resume
// POST then fails ("no longer in memory"), the card re-renders forever, and the
// suspended tool step keeps spinning. Nothing else flips this back.
//
// On thread load we detect that orphaned state and heal it: clear the interrupt
// and mark the dangling tool step(s) resolved so the thread returns to a usable
// state and the spinner stops on replay.
//
// NOTE: the park map is process-local (see run-event-bus D7 — no multi-instance
// fan-out), so this relies on session-affinity routing sending a thread's loads
// to the instance that owns its park. The additional expiry check is a
// deployment-agnostic backstop: an expired interrupt is un-resumable on any
// instance.
import {
  type AgUiOpenInterruptMetadata,
  isAgUiOpenInterruptExpired,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import type { ThreadStore } from "../../dal/threads/index.js";
import {
  isParkedResumeInFlight,
  isSessionRunParked,
} from "../conversation/session-park.js";
import { mergeAgUiOpenInterruptMetadata } from "./interrupts.js";
import {
  hasResumableSnapshot,
  type ResumableSnapshotProbe,
} from "./resumable-snapshot.js";
import { isRunLiveInProcess } from "./run-event-bus.js";
import type { AiSessionScope } from "./types.js";

interface ToolInvocationPart {
  toolInvocation?: {
    result?: unknown;
    state?: string;
    toolCallId?: string;
  };
  type?: string;
}

/**
 * What the predicate needs to ask storage whether a run is still resumable.
 * A FACTORY, not a value: assembling it costs a registry, so it is built only
 * on the rare path that actually reaches storage — never on a plain thread load.
 */
export type OrphanSnapshotProbe = () => Omit<ResumableSnapshotProbe, "runId">;

/**
 * An open interrupt is ORPHANED — unresumable — when either:
 *  - it has expired (resume validation already rejects it), or
 *  - it needs an in-process parked session (has a `run_id`) and that session is
 *    gone — not live, not mid-resume, not parked here — AND Mastra holds no
 *    suspended snapshot for the run either.
 * Interrupts without a `run_id` resume by re-run (decision/feedback artifacts),
 * so they are only orphaned once expired.
 *
 * The snapshot probe is deliberately LAST: the three in-process checks are free
 * and settle the common case, so storage is only read on the rare path where
 * they all miss — which is precisely the post-restart case it exists for.
 * Expiry stays FIRST and eager: an expired interrupt is unusable regardless of
 * what storage still holds, and this reconciler is the only thing standing
 * between a stale interrupt and a permanently wedged chat.
 *
 * Omitting `probe` keeps the old in-process-only behaviour (used by callers
 * that have no registry to assemble an agent with).
 */
export async function isOpenInterruptOrphaned(
  open: AgUiOpenInterruptMetadata,
  probe?: OrphanSnapshotProbe,
  nowMs?: number
): Promise<boolean> {
  if (isAgUiOpenInterruptExpired(open, nowMs)) {
    return true;
  }
  const runId = open.run_id;
  if (!runId) {
    return false;
  }
  if (
    isRunLiveInProcess(runId) ||
    isParkedResumeInFlight(runId) ||
    isSessionRunParked(runId)
  ) {
    return false;
  }
  // Last resort, and the whole point of this change: the park is gone, but
  // Mastra may still hold a suspended snapshot for the run — in which case the
  // resume POST can continue it and clearing the interrupt would destroy it.
  if (!probe) {
    return true;
  }
  return !(await hasResumableSnapshot({ ...probe(), runId }));
}

/**
 * Mark every unresolved tool-invocation part in the wedged assistant turn as
 * resolved-with-error so its spinner stops on replay. Scoped to the message
 * that owns `toolCallId` (the parked call) — its parallel siblings live there
 * too — so earlier turns are never touched. Best-effort.
 */
async function resolveDanglingToolStepsInWedgedTurn(input: {
  scope: AiSessionScope;
  store: ThreadStore;
  threadId: string;
  toolCallId: string | undefined;
}): Promise<void> {
  if (!input.toolCallId) {
    return;
  }
  try {
    const rows = await input.store.listMessagesOrdered({
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
    // Find the assistant turn that owns the parked tool call.
    const target = [...rows]
      .reverse()
      .find(
        (row) =>
          Array.isArray(row.parts) &&
          (row.parts as ToolInvocationPart[]).some(
            (part) =>
              part?.type === "tool-invocation" &&
              part.toolInvocation?.toolCallId === input.toolCallId
          )
      );
    if (!(target && Array.isArray(target.parts))) {
      return;
    }
    let changed = false;
    const parts = (target.parts as ToolInvocationPart[]).map((part) => {
      const ti = part?.toolInvocation;
      if (part?.type === "tool-invocation" && ti && ti.state !== "result") {
        changed = true;
        return {
          ...part,
          toolInvocation: {
            ...ti,
            result: {
              error: "interrupted",
              interrupted: true,
              message:
                "This step was interrupted and could not be completed. Ask again to retry.",
            },
            state: "result",
          },
        };
      }
      return part;
    });
    if (!changed) {
      return;
    }
    await input.store.updateMessageParts({
      messageId: target.id,
      parts: parts as never,
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
  } catch (error) {
    console.error(
      "[reconcile-interrupt] failed to resolve dangling tool steps:",
      error
    );
  }
}

/**
 * Detect and heal an orphaned open interrupt for this thread. Returns the
 * updated session metadata when a heal happened, or null when nothing was
 * wedged (the common case). Safe to call on every thread load.
 */
export async function reconcileOrphanedInterrupt(input: {
  metadata: Record<string, unknown>;
  // Omitted by callers with no registry: the predicate then stays
  // in-process-only, i.e. pre-snapshot behaviour.
  probe?: OrphanSnapshotProbe;
  scope: AiSessionScope;
  store: ThreadStore;
  threadId: string;
  userId: string;
}): Promise<Record<string, unknown> | null> {
  const open = readAgUiOpenInterrupt(input.metadata);
  if (!(open && (await isOpenInterruptOrphaned(open, input.probe)))) {
    return null;
  }
  await resolveDanglingToolStepsInWedgedTurn({
    scope: input.scope,
    store: input.store,
    threadId: input.threadId,
    toolCallId: open.tool_call_id,
  });
  const nextMetadata = mergeAgUiOpenInterruptMetadata(input.metadata, null);
  try {
    const updated = await input.store.updateThreadForUser({
      metadata: nextMetadata,
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.userId,
    });
    return updated.thread?.metadata ?? nextMetadata;
  } catch (error) {
    console.error(
      "[reconcile-interrupt] failed to clear orphaned interrupt:",
      error
    );
    return null;
  }
}
