// Running a task job on Mastra's BackgroundTaskManager (Phase 8 P8-2).
//
// What this replaces, and why: the dispatch path was a pgmq queue + a consumer
// that awaited a six-step Mastra workflow, plus `restartAllActiveWorkflowRuns`
// at boot to pick up what a crash left behind. All three are infrastructure
// Mastra did not have when we built them and ships now — persistence, per-agent
// concurrency, backpressure, stale-task recovery and a lifecycle stream — so
// the job becomes an ordinary function (task-job-pipeline.ts) and the manager
// carries it.
//
// The executor is registered STATICALLY, by name, rather than as a per-enqueue
// closure. That is the difference between a substrate that recovers and one
// that only looks like it does: after a restart the manager re-dispatches
// tasks it left running, and in that process there is no closure to call — it
// resolves the executor by tool name. A per-task context would strand every
// task the crash caught.
//
// Cutover 2026-08-17: this IS the dispatch path. The six-step workflow, its
// registration and the two-substrate switch are gone — kept only long enough to
// prove crash-recovery parity live (kill a process mid-run; the next boot
// re-dispatches and re-enters on the original run id), which is the condition
// the plan put on deleting them.
import { randomUUID } from "node:crypto";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import { runTaskJobPipeline } from "../ai/jobs/task-job-pipeline.js";
import {
  type ApprovedResumeCall,
  type TaskJobEnvelope,
  type TaskJobInput,
  taskJobInputSchema,
  taskJobResumeDataSchema,
  taskJobSuspendPayloadSchema,
} from "../ai/jobs/task-job-schema.js";
import { resolveNotifications } from "../notifications/inbox.js";

const logger = createLogger({ name: "task-background-dispatch" });

/** The tool name a task job is dispatched under; the executor key on restart. */
export const TASK_JOB_TOOL_NAME = "engenty.task-job";

/**
 * How many times a dispatched task may be attempted. Above zero is REQUIRED for
 * crash recovery (see the enqueue below); the value itself is the retry budget
 * for a job that throws, which the queue this replaces gave unbounded.
 */
export const TASK_JOB_MAX_ATTEMPTS = 3;

/**
 * A run that ended because it needs a human — a question it asked, or a
 * permission it was refused. Both come back through the same door: a person
 * answers, the task is dispatched again.
 */
function isWaitingOnAPerson(envelope: { status?: string }): boolean {
  return (
    envelope.status === "needs_input" || envelope.status === "needs_approval"
  );
}

/** The agent a background task is attributed to — for per-agent concurrency. */
function agentIdFor(input: TaskJobInput): string {
  return input.agent_type_key ?? "engenty.task";
}

/**
 * The one executor body, shared by both registrations below. `suspend` is
 * optional on purpose: with it, a run that stopped for a person suspends so the
 * answer resumes THIS run (tier 1); without it the run has still parked —
 * question comment written, task in review — and the answer dispatches a fresh
 * run (tier 2). Both are correct; the difference is one run vs. two in history.
 */
async function executeTaskJob(
  args: Record<string, unknown>,
  options?: {
    abortSignal?: AbortSignal;
    resumeData?: unknown;
    suspend?: (payload: Record<string, unknown>) => Promise<unknown>;
  }
): Promise<unknown> {
  const parsed = taskJobInputSchema.safeParse(args);
  if (!parsed.success) {
    // A malformed payload cannot be retried into correctness; fail it
    // loudly rather than leaving a task claimed by a run that no-ops.
    throw new Error(
      `task-job background args invalid: ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`
    );
  }
  const runId = String(args.__run_id ?? randomUUID());
  // Calls approved while this run was parked, handed back by the tier-1
  // resume. Read ONLY from `resumeData` — never from the enqueue args — so a
  // fresh dispatch cannot smuggle a replay in; and Mastra clears the suspend
  // payload when a resume claims the task, so the same park can never feed
  // two resumes (the single-use gate).
  const resume = taskJobResumeDataSchema.safeParse(options?.resumeData);
  const approvedResumeCalls = resume.success
    ? (resume.data.approved_calls ?? [])
    : [];
  const { envelope, waitedOnAPerson } = await runTaskJobPipeline(
    parsed.data,
    runId,
    {
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
      ...(approvedResumeCalls.length > 0 ? { approvedResumeCalls } : {}),
    }
  );
  // Tier-1 HITL (Phase 8 P8-3): a run that stopped to ask has already
  // PARKED — question comment written, task in review, inbox notified — so
  // everything works from here whether or not this suspend happens.
  // Suspending on top of that means the next dispatch can resume THIS run
  // instead of starting a second one, which is what keeps a task's history
  // one run across an answer instead of one run per round-trip.
  if (options?.suspend && waitedOnAPerson) {
    // The suspend payload carries the exact gated calls this run parked on
    // (operation + args), so the approval that resumes it can replay each
    // one exactly once instead of the re-briefed model re-deriving them.
    const pendingCalls: ApprovedResumeCall[] = (
      (envelope as TaskJobEnvelope).pending_approvals ?? []
    ).map((p) => ({
      operation_id: p.operation_id,
      ...(p.input ? { input: p.input } : {}),
      ...(p.title ? { title: p.title } : {}),
    }));
    await options.suspend({
      task_id: parsed.data.task_id,
      ...(pendingCalls.length > 0 ? { pending_calls: pendingCalls } : {}),
    });
  }
  return envelope;
}

/**
 * The task job as a Mastra config-level tool, for CRASH RECOVERY only.
 *
 * Mastra 1.59 initializes the BackgroundTaskManager inside the Mastra
 * CONSTRUCTOR (fire-and-forget `init()`, which runs `recoverStaleTasks`), so a
 * task a crash left `running` can be re-executed before any boot code gets to
 * call `registerTaskJobExecutor` — 1.57 only initialized in `startWorkers`,
 * after our registration. The one registration path the constructor performs
 * synchronously BEFORE `init()` is the config `tools` map, on every manager
 * instance it ever builds (including the rebuild `startWorkers` does when it
 * upgrades a producer-mode manager). So this tool is the executor recovery is
 * guaranteed to find.
 *
 * Mastra's tool→executor adapter forwards only `abortSignal` — no `suspend` —
 * so a RECOVERED run that stops for a person parks tier-2 (fresh run on
 * answer). That is the crash-degraded lane by design. Steady-state dispatches
 * use the suspend-capable static executor, which `registerTaskJobExecutor`
 * overwrites this entry with after `startWorkers`.
 */
export const taskJobRecoveryTool = {
  description:
    "Executes a dispatched Engenty task job (crash-recovery registration).",
  execute: (
    args: Record<string, unknown>,
    ctx?: { abortSignal?: AbortSignal }
  ) =>
    executeTaskJob(args, {
      ...(ctx?.abortSignal ? { abortSignal: ctx.abortSignal } : {}),
    }),
  id: TASK_JOB_TOOL_NAME,
};

/**
 * Register the suspend-capable task-job executor on the manager, replacing the
 * recovery tool's suspend-less adapter for all steady-state work. MUST run
 * after `startWorkers("backgroundTasks")`: startWorkers DISCARDS a
 * producer-mode manager and builds a new one, and an executor registered on
 * the old instance dies with it. Idempotent, and safe to call when background
 * tasks are disabled (it simply does nothing).
 */
export function registerTaskJobExecutor(mastra: Mastra): boolean {
  const manager = mastra.backgroundTaskManager;
  if (!manager) {
    return false;
  }
  manager.registerStaticExecutor(TASK_JOB_TOOL_NAME, {
    execute: executeTaskJob,
  });
  logger.info("task job executor registered", { tool: TASK_JOB_TOOL_NAME });
  return true;
}

export interface StartedTaskJob {
  /** Settles when the job reaches a terminal state; already logged. */
  done: Promise<void>;
  /** The run id — also the task's `checkout_run_id` once claimed. */
  runId: string;
}

/**
 * Enqueue a task job as a background task and return as soon as it EXISTS, so
 * a caller that only needs the id (a button press) does not wait for the work.
 *
 * The run id is minted here and carried in the args: the pipeline needs it for
 * checkout, and a restart must re-enter with the SAME id or it would collide
 * with the checkout its own previous attempt took.
 */
export async function startTaskJob(
  // The loose Mastra type on purpose: the HTTP route holds the generic
  // instance and the consumer the concrete one.
  mastra: Mastra,
  inputData: TaskJobInput
): Promise<StartedTaskJob> {
  const manager = mastra.backgroundTaskManager;
  if (!manager) {
    throw new Error(
      "background task dispatch requested but backgroundTasks is disabled"
    );
  }

  // Work restarts because an answer arrived (or someone re-ran the task): the
  // decisions announced for this task are answered or moot either way.
  await resolveNotifications({
    outcome: "resumed",
    subjectId: inputData.task_id,
    subjectType: "task",
    tenantId: inputData.tenant_id,
  });

  // Tier 1 first: this task may already have a run parked mid-flight, waiting
  // for the answer that just arrived. Resuming it keeps one run where a fresh
  // enqueue would show two.
  const suspended = await findSuspendedTaskJob(manager, inputData.task_id);
  if (suspended) {
    try {
      // Hand the parked run's recorded gated calls back in as resumeData, so
      // the resumed run replays each approved call exactly once and briefs
      // the model with the results. The suspend payload is the ONLY carrier:
      // Mastra clears it atomically when the resume claims the task, which
      // is what makes the replay single-use.
      const payload = taskJobSuspendPayloadSchema.safeParse(
        (suspended as { suspendPayload?: unknown }).suspendPayload
      );
      const pendingCalls = payload.success
        ? (payload.data.pending_calls ?? [])
        : [];
      await manager.resume(
        suspended.id,
        pendingCalls.length > 0 ? { approved_calls: pendingCalls } : undefined
      );
      logger.info("resumed the run that was waiting on a person", {
        replayedCalls: pendingCalls.map((call) => call.operation_id),
        runId: suspended.runId,
        taskId: inputData.task_id,
      });
      return {
        done: watchTaskJob(manager, suspended.id, suspended.runId, inputData),
        runId: suspended.runId,
      };
    } catch (err) {
      // Tier 2 is not a fallback bolted on — it is the path that always
      // worked, and the comment thread carries both halves of the exchange, so
      // starting fresh loses nothing but the run's continuity.
      logger.warn("resume failed; dispatching a fresh run instead", {
        error: err instanceof Error ? err.message : String(err),
        taskId: inputData.task_id,
      });
    }
  }

  const runId = randomUUID();
  const enqueued = await manager.enqueue({
    agentId: agentIdFor(inputData),
    args: { ...inputData, __run_id: runId },
    // NOT a preference — the recovery contract. `recoverStaleTasks` returns a
    // task the crash caught to `pending` only when `maxRetries > 0`; with the
    // default 0 it marks it failed and the task row stays `in_progress`
    // forever. Proven by killing a process mid-run (Phase 8 P8-2 probe).
    // Bounded on purpose: the pgmq redelivery this replaces retried without
    // limit, so a poison task could loop.
    maxRetries: TASK_JOB_MAX_ATTEMPTS,
    runId,
    toolCallId: runId,
    toolName: TASK_JOB_TOOL_NAME,
  });
  logger.info("task job enqueued as a background task", {
    agentTypeKey: inputData.agent_type_key,
    runId,
    taskId: inputData.task_id,
    taskRecordId: enqueued.task.id,
  });
  return {
    done: watchTaskJob(manager, enqueued.task.id, runId, inputData),
    runId,
  };
}

/** The suspended run for this task, if one is waiting to be answered. */
async function findSuspendedTaskJob(
  manager: NonNullable<Mastra["backgroundTaskManager"]>,
  taskId: string
) {
  try {
    const { tasks } = await manager.listTasks({
      status: "suspended",
      toolName: TASK_JOB_TOOL_NAME,
    });
    return (
      tasks.find(
        (task) => (task.args as { task_id?: string }).task_id === taskId
      ) ?? null
    );
  } catch (err) {
    logger.warn("suspended-run lookup failed; dispatching fresh", {
      error: err instanceof Error ? err.message : String(err),
      taskId,
    });
    return null;
  }
}

/** Log where a job ended up; never the thing that decides anything. */
function watchTaskJob(
  manager: NonNullable<Mastra["backgroundTaskManager"]>,
  backgroundTaskId: string,
  runId: string,
  inputData: TaskJobInput
): Promise<void> {
  return manager
    .waitForNextTask([backgroundTaskId])
    .then((task) => {
      logger.info("background task job settled", {
        runId,
        status: task.status,
        taskId: inputData.task_id,
      });
    })
    .catch((err: unknown) => {
      logger.error("background task job threw", {
        error: err instanceof Error ? err.message : String(err),
        runId,
        taskId: inputData.task_id,
      });
      throw err;
    });
}
