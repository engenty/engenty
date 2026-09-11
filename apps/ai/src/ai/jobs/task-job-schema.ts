// Schemas for the Task Job workflow. One envelope object flows through every
// step (uniform input/output) so a step can short-circuit by passing the
// envelope through untouched — e.g. a checkout conflict marks `skipped` and the
// remaining steps no-op. The workflow's own input is the dispatch message.
import { z } from "zod";

// The dispatch message ({ task_id, agent_type_key, tenant_id }) — the workflow
// input and the first step's input.
//
// One shape only: a TASK-SUBJECT run, where a human or an agent assigned a work
// item to a specialist. A routine no longer comes through here — a fire starts a
// run of its own (ai/routines/fire-routine.ts), with no task to supervise it.
export const taskJobInputSchema = z.object({
  // Optional so an in-flight dispatch from before the field was required still
  // parses; the checkout step refuses a task with no specialist to run it.
  agent_type_key: z.string().min(1).optional(),
  task_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  // Why this run is happening, set by whoever dispatched it: a person pressing
  // Run, an event subscription. Absent when the dispatcher could not say
  // (core's own dispatchTaskIfReady) — the run then records no trigger rather
  // than claiming one.
  started_by: z.enum(["cron", "button", "hook", "direct"]).optional(),
});

export type TaskJobInput = z.infer<typeof taskJobInputSchema>;

// Pipeline status carried between steps. `skipped` (checkout conflict — we never
// claimed the task) short-circuits every downstream step. `ran`/`failed` are the
// specialist outcome and are preserved THROUGH write/finalize so those steps can
// choose the comment + terminal status (in_review vs blocked).
export const taskJobStatusSchema = z.enum([
  "checked_out",
  "skipped",
  "briefed",
  "ran",
  "failed",
  // The specialist hit a tool requiring approval that is not yet granted: the
  // run ended gracefully, the task is flipped to `blocked`, and a needs-input
  // notification + comment are recorded. A human approves → re-dispatch.
  "needs_approval",
  // The specialist could not finish without an answer only a human can give
  // (TASK_BLOCKED marker, or `task_ask_user`). Same landing as needs_approval —
  // `blocked`, a comment, an inbox row — but the ask is a question, not a grant.
  "needs_input",
  "released",
]);

/** One tool-approval request surfaced by a "request"-policy run. */
export const pendingApprovalSchema = z.object({
  operation_id: z.string(),
  risk_level: z.string().optional(),
  title: z.string().optional(),
  // The gated call's arguments, recorded so an approval can REPLAY the exact
  // call the human saw instead of leaving the resumed model to re-derive it
  // (which double-executed tasks_create on goal 01a02926 — 2026-08-22).
  // Absent for bulk pre-approvals (a plan, not one replayable call) and for
  // workspace-tool suspensions (not module operations).
  input: z.record(z.string(), z.unknown()).optional(),
});

export type PendingApproval = z.infer<typeof pendingApprovalSchema>;

/**
 * A recorded gated call handed back into the run its approval resumes.
 *
 * Travels ONLY through the background task's durable suspend payload and the
 * resume's `resumeData` — never through enqueue args — so a fresh dispatch can
 * never carry one. Mastra clears the suspend payload atomically when a resume
 * claims the task (status suspended → running), which is the single-use gate:
 * a second resume of the same park finds no payload and replays nothing.
 */
export const approvedResumeCallSchema = z.object({
  operation_id: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  title: z.string().optional(),
});

export type ApprovedResumeCall = z.infer<typeof approvedResumeCallSchema>;

/** The suspend payload a parked task job leaves in Mastra's background store. */
export const taskJobSuspendPayloadSchema = z.object({
  task_id: z.string(),
  pending_calls: z.array(approvedResumeCallSchema).optional(),
});

/** What a tier-1 resume passes back into the executor as `resumeData`. */
export const taskJobResumeDataSchema = z.object({
  approved_calls: z.array(approvedResumeCallSchema).optional(),
});

export const taskJobEnvelopeSchema = z.object({
  agent_type_key: z.string().min(1).optional(),
  brief: z.string().optional(),
  identifier: z.string().optional(),
  note: z.string().optional(),
  result_text: z.string().optional(),
  status: taskJobStatusSchema,
  task_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  // The task's own title — the fallback subject for inbox rows when no
  // headline can be generated from the result text.
  title: z.string().optional(),
  // The run's ai.thread id — created at checkout so the run is first-class
  // (ai.agent_run.thread_id) and the specialist runs on a drillable thread.
  thread_id: z.string().uuid().optional(),
  // Effective approval grants for this run (task ∪ once), read at brief time.
  // Optional so in-flight snapshots from before this field parse.
  approval_grants: z.array(z.string()).optional(),
  // The task's space, for the completion policy (space agent_approval_mode
  // decides review vs auto-complete). Optional so in-flight snapshots parse.
  space_id: z.string().uuid().nullable().optional(),
  // The task's primary assignee, so a decision or alert about this run
  // reaches that person (notification audience ladder). Optional so in-flight
  // snapshots parse.
  assignee_user_id: z.string().uuid().nullable().optional(),
  // MODEL override for this run. When set it rides the model resolver chain's
  // `override` slot, so it beats the tenant purpose defaults and per-agent
  // purpose inheritance — but stays inside the tenant's governance grants
  // (a disallowed pin falls through).
  model_id: z.string().min(1).optional(),
  // Tool-approval requests the specialist hit under the "request" policy.
  pending_approvals: z.array(pendingApprovalSchema).optional(),
  // What a `needs_input` run asked for (the TASK_BLOCKED question).
  blocked_question: z.string().optional(),
  // Calls approved while this run was parked, handed in by the tier-1 resume
  // (see approvedResumeCallSchema). The specialist step replays each covered
  // call ONCE before the model turn and puts the result into the brief.
  approved_resume_calls: z.array(approvedResumeCallSchema).optional(),
  // The question a `task_ask_user` run asked, for the notification subject.
  // The question body itself already lives on the task as a comment.
  question: z.string().optional(),
});

export type TaskJobEnvelope = z.infer<typeof taskJobEnvelopeSchema>;

/** We never claimed the task (checkout conflict) — every downstream step no-ops. */
export function isSkippedEnvelope(env: TaskJobEnvelope): boolean {
  return env.status === "skipped";
}
