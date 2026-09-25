// The ONE way to run a published graph outside a Task.
//
// A run belongs to a caller and a subject; whether a Task supervises it is a
// property OF the run (`ai.workflow_run.owner_task_id` — "Null for
// button/agent-started runs"), never the way in. This module is that way in,
// shared by the canvas Run button, the WorkflowButton/slash press and
// `invoke_workflow`'s out-of-task path — so the press cannot drift from the
// canvas again the way it did when each had its own dispatch.
//
// What every caller gets by coming through here:
//  · per-subject dedup — an in-flight run for this (action, subject) wins
//    rather than starting a second; the rule single-agent actions always had
//  · the subject in the RUN CONTEXT, which is where `run_specialist` reads
//    the `## Subject` section from — not from a task row that may not exist
//  · an `workflow_run` audit row binding caller, subject and pinned version
//  · idempotent retries: a stable key derives stable run/request ids, and a
//    replayed dispatch finds its own earlier row instead of running twice
import { createHash, randomUUID } from "node:crypto";
import type { SpaceGateContext } from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import type { WorkflowWithVersion } from "../../dal/workflows/workflow-store.js";
import { createWorkflowRunStoreFromEnv } from "../index.js";
import { registerActionRun } from "../jobs/action-job-run-record.js";
import type { AiSessionScope } from "../sessions/types.js";
import { type GraphRunOutcome, startGraphRun } from "./dispatch.js";
import { assertFlowInput } from "./flow-input.js";
import { approvalPolicyForRun } from "./run-context.js";
import { settleGraphRun } from "./run-lifecycle.js";

/** Deterministic UUID from a seed — a retried dispatch lands on the same ids. */
export function stableUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/** The id inside a resolved space claim; null for an unresolved or absent one. */
function spaceIdOf(space: SpaceGateContext | null | undefined): string | null {
  if (space && "spaceId" in space && typeof space.spaceId === "string") {
    return space.spaceId;
  }
  return null;
}

export interface DispatchPublishedActionRunInput {
  /**
   * What this run may do without asking — a routine's standing allow-list.
   * Absent for a press, which has a human in front of it to ask.
   */
  approvalGrants?: readonly string[];
  /** Whose desk the run belongs on — the owning specialist for a routine. */
  /**
   * The conversation this run was asked for in, when there was one. Carried so
   * a step can read the request's own context; never written to.
   */
  callerThreadId?: string | null;
  context: { contextId: string | null; contextType: string | null };
  current: WorkflowWithVersion;
  deskAgentId?: string | null;
  /** Stable retry key (chat redelivery); omitted = every call is a fresh run. */
  idempotencyKey?: string;
  input: Record<string, unknown>;
  /**
   * The routine this fire belongs to. Recorded on the run so the desk can
   * group runs by routine, and so the overlap guard has something to key on
   * that is neither the action (two routines may share one) nor a task.
   */
  routineId?: string | null;
  /** The routine's name, for the desk. */
  routineTitle?: string | null;
  scope: AiSessionScope;
  /**
   * The Space this run may reach, already resolved.
   *
   * A caller that knows the Space authoritatively passes it; otherwise
   * `withGraphRunSpace` falls back to the ALS and then the thread. A scheduled
   * fire has neither — no request is in flight — so it must resolve its own or
   * every module tool refuses with `space_context_unresolved`.
   */
  space?: SpaceGateContext | null;
  /** The Space the run belongs to — stamped on its thread so memory agrees. */
  spaceId?: string | null;
  /**
   * The thread this run writes into. Omitted mints a fresh one, which is right
   * for a press: it answers once and the transcript is that answer.
   *
   * A ROUTINE passes its own standing thread instead, so a schedule keeps one
   * log rather than minting a room per tick. It cannot reuse `idempotencyKey`
   * to get there — that key also derives `runId`, so the second fire would
   * find the first run and dedupe itself out of existence.
   */
  threadId?: string | null;
  /** How the run started — the `workflow_run.trigger` vocabulary. */
  trigger: "button" | "command" | "cron" | "direct" | "hook" | "task";
  /** Id the audit row files under — the module workflow id for a press, the graph id elsewhere. */
  workflowId: string;
}

export interface DispatchedPublishedActionRun {
  /** True when an earlier run answered instead of a new one starting. */
  deduped: boolean;
  requestId: string;
  runId: string;
  threadId: string;
}

export async function dispatchPublishedWorkflowRun(
  input: DispatchPublishedActionRunInput
): Promise<DispatchedPublishedActionRun> {
  const { context, current, scope } = input;
  // Before anything is registered: input the graph requires and this call does
  // not carry can only produce a failed run the caller was told was queued.
  assertFlowInput(current.version.input_schema, input.input);
  const requests = createWorkflowRunStoreFromEnv();
  const tenantId = scope.tenantId;

  const runId = input.idempotencyKey
    ? stableUuid(`action-run:${input.idempotencyKey}`)
    : randomUUID();
  const requestId = input.idempotencyKey
    ? stableUuid(`action-request:${input.idempotencyKey}`)
    : randomUUID();
  const threadId =
    input.threadId ??
    (input.idempotencyKey
      ? stableUuid(`action-thread:${input.idempotencyKey}`)
      : randomUUID());

  if (requests) {
    // A redelivered dispatch (chat retry) finds its own earlier row.
    if (input.idempotencyKey) {
      const replayed = await requests.getByRunId({ runId, tenantId });
      if (replayed) {
        return {
          deduped: true,
          requestId: replayed.id,
          runId,
          threadId: replayed.thread_id ?? threadId,
        };
      }
    }
    // Per-subject dedup: pressing while this subject's run is in flight (or
    // suspended on a human) answers with THAT run instead of racing it.
    if (context.contextId || context.contextType) {
      const active = await requests.findActive({
        workflowId: input.workflowId,
        contextId: context.contextId,
        contextType: context.contextType,
        tenantId,
      });
      if (active?.run_id) {
        return {
          deduped: true,
          requestId: active.id,
          runId: active.run_id,
          threadId: active.thread_id ?? threadId,
        };
      }
    }
  }

  // A routine names its own specialist; a press falls back to whoever owns the
  // action. Either way this is the desk whose chat the run speaks into — its
  // own thread is a log nobody opens.
  const deskAgentId = input.deskAgentId ?? current.graph.owner_agent_id;

  await registerActionRun({
    workflowId: input.workflowId,
    agentId: `workflow:${current.graph.id}`,
    contextId: context.contextId,
    contextType: context.contextType,
    deskAgentId: deskAgentId ?? null,
    routineId: input.routineId ?? null,
    routineTitle: input.routineTitle ?? null,
    runId,
    scope,
    // The Space the run belongs to. A caller that resolved the claim already
    // holds it, so fall back to that rather than leaving the run's thread
    // space-less: everything the run says later is resolved FROM this thread
    // (the desk it speaks into, its memory), and a thread with no Space has
    // no desk to reach.
    spaceId: input.spaceId ?? spaceIdOf(input.space),
    threadId,
    // Already known here: the caller said whether this was a press, a slash
    // command or an API dispatch.
    trigger: input.trigger,
  });
  await requests?.create({
    workflowVersionId: current.version.id,
    workflowId: input.workflowId,
    agentId: `workflow:${current.graph.id}`,
    contextId: context.contextId,
    contextType: context.contextType,
    id: requestId,
    payload: input.input,
    routineId: input.routineId ?? null,
    runId,
    tenantId,
    threadId,
    trigger: input.trigger,
  });

  // A run a person walks asks on its own approval step instead of failing a
  // gated call silently.
  const approvalPolicy = approvalPolicyForRun({
    surface: current.graph.surface,
    trigger: input.trigger,
  });
  const runCtx = {
    workflowId: current.graph.id,
    workflowVersion: current.version.version,
    requestId,
    tenantId,
    threadId,
    ...(current.version.allowed_tools
      ? { allowedToolIds: current.version.allowed_tools }
      : {}),
    ...(context.contextType ? { contextType: context.contextType } : {}),
    ...(context.contextId ? { contextId: context.contextId } : {}),
    ...(deskAgentId ? { deskAgentId } : {}),
    // Only when somebody asked. A schedule has no conversation behind it, and
    // pointing a fire at the thread its routine was WRITTEN in would be a
    // stale answer to "where did this come from".
    ...(input.callerThreadId ? { callerThreadId: input.callerThreadId } : {}),
    // Carries into the run so a specialist node's tool calls can spend the
    // routine's own approval grants, and so its durable workspace is rooted
    // on the routine rather than on nothing.
    ...(input.routineId ? { routineId: input.routineId } : {}),
    ...(input.approvalGrants?.length
      ? { approvalGrants: input.approvalGrants }
      : {}),
    ...(input.space === undefined ? {} : { space: input.space }),
    ...(scope.userId ? { userId: scope.userId } : {}),
    ...(approvalPolicy ? { approvalPolicy } : {}),
  };

  // Fire and forget: a graph can legitimately run for minutes or sleep for
  // days, so the caller gets ids to watch, not a result to wait on.
  void runInBackground({
    ctx: runCtx,
    input: input.input,
    requestId,
    runId,
    tenantId,
  });

  return { deduped: false, requestId, runId, threadId };

  async function runInBackground(run: {
    ctx: typeof runCtx;
    input: Record<string, unknown>;
    requestId: string;
    runId: string;
    tenantId: string;
  }): Promise<void> {
    let outcome: GraphRunOutcome;
    try {
      outcome = await startGraphRun({
        ctx: run.ctx,
        input: run.input,
        runId: run.runId,
        version: current.version,
      });
    } catch (err) {
      outcome = {
        reason: err instanceof Error ? err.message : String(err),
        status: "failed",
      };
    }
    await settleGraphRun({
      ...(run.ctx.callerThreadId
        ? { callerThreadId: run.ctx.callerThreadId }
        : {}),
      initiatorUserId: run.ctx.userId ?? null,
      outcome,
      outputSchema: current.version.output_schema,
      requestId: run.requestId,
      runId: run.runId,
      space: run.ctx.space ?? null,
      tenantId: run.tenantId,
    });
  }
}
