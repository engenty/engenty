// The task job as a plain sequence (Phase 8 P8-2).
//
// The five steps have always been a straight line: checkout → brief → run the
// specialist → write the result → finalize. They were
// expressed as a Mastra workflow to get durability, and that shape came with a
// cost the plan calls out: an in-flight run resumes into the code it was
// suspended under, so the step list is frozen while any run is live.
//
// Mastra's BackgroundTaskManager provides the durability (persistence,
// concurrency, backpressure, restart-on-boot) around an ORDINARY function, so
// the sequence can be exactly that. This module is that function, and it is the
// single definition of the order — the workflow's `.then()` chain is checked
// against it in a test so the two substrates can never drift while both exist.
import type { Step } from "@mastra/core/workflows";
import type {
  ApprovedResumeCall,
  TaskJobEnvelope,
  TaskJobInput,
} from "./task-job-schema.js";
import { runSpecialistStep } from "./task-job-specialist-step.js";
import {
  buildBriefStep,
  checkoutStep,
  finalizeStep,
  writeResultStep,
} from "./task-job-steps.js";

/**
 * The order, once. Every step takes the previous step's envelope and returns
 * one; each no-ops on a `skipped` envelope, which is what makes a redelivered
 * dispatch harmless.
 */
export const TASK_JOB_STEPS = [
  checkoutStep,
  buildBriefStep,
  runSpecialistStep,
  writeResultStep,
  finalizeStep,
] as const;

/** The step ids in order — what the workflow's chain is asserted against. */
export const TASK_JOB_STEP_IDS = TASK_JOB_STEPS.map((step) => step.id);

interface StepExecuteParams {
  abortSignal?: AbortSignal;
  inputData: unknown;
  runId: string;
}

/**
 * A run that stopped because it needs a human — it asked a question, or it was
 * refused a permission. Both come back the same way: a person answers and the
 * task is dispatched again.
 *
 * This is read from the envelope BETWEEN steps, not from the end of the run:
 * finalize's job is to release the task, and it reports `released` whatever the
 * reason was. The reason is what the caller needs to know.
 */
function stoppedForAPerson(envelope: unknown): boolean {
  const status = (envelope as { status?: string } | null)?.status;
  return status === "needs_input" || status === "needs_approval";
}

export interface TaskJobPipelineResult {
  envelope: TaskJobEnvelope;
  /** True when the run ended waiting on a person rather than on itself. */
  waitedOnAPerson: boolean;
}

/**
 * Run a task job to completion.
 *
 * `runId` is the task's `checkout_run_id`: checkout is idempotent for the same
 * run id (and replaces a stale checkout), so re-entering this function after a
 * crash with the SAME id resumes ownership instead of colliding with itself —
 * which is what makes a restart-from-the-top substrate safe here.
 */
export async function runTaskJobPipeline(
  inputData: TaskJobInput,
  runId: string,
  options?: {
    abortSignal?: AbortSignal;
    /**
     * Calls approved while this task's parked run waited (tier-1 resume).
     * Passed as an option — NOT part of `TaskJobInput` — so they can only
     * enter through a resume's `resumeData`, never through enqueue args; a
     * fresh dispatch therefore never replays anything.
     */
    approvedResumeCalls?: readonly ApprovedResumeCall[];
  }
): Promise<TaskJobPipelineResult> {
  // Seeded ahead of the checkout step, which spreads its input forward — the
  // calls ride the envelope to the specialist step.
  let envelope: unknown = options?.approvedResumeCalls?.length
    ? {
        ...inputData,
        approved_resume_calls: [...options.approvedResumeCalls],
      }
    : inputData;
  let waitedOnAPerson = false;
  for (const step of TASK_JOB_STEPS) {
    const params: StepExecuteParams = {
      inputData: envelope,
      runId,
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
    };
    envelope = await (step as unknown as Step).execute(params as never);
    waitedOnAPerson = waitedOnAPerson || stoppedForAPerson(envelope);
  }
  return { envelope: envelope as TaskJobEnvelope, waitedOnAPerson };
}
