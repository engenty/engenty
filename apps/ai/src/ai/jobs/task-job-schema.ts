// Schemas for the Task Job workflow. One envelope object flows through every
// step (uniform input/output) so a step can short-circuit by passing the
// envelope through untouched — e.g. a checkout conflict marks `skipped` and the
// remaining steps no-op. The workflow's own input is the dispatch message.
import { z } from "zod";

// The dispatch message ({ task_id, agent_type_key, tenant_id }) — the workflow
// input and the first step's input.
export const taskJobInputSchema = z.object({
  agent_type_key: z.string().min(1),
  task_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
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
  "released",
]);

export const taskJobEnvelopeSchema = z.object({
  agent_type_key: z.string().min(1),
  brief: z.string().optional(),
  identifier: z.string().optional(),
  note: z.string().optional(),
  result_text: z.string().optional(),
  status: taskJobStatusSchema,
  task_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  // The run's ai.thread id — created at checkout so the run is first-class
  // (ai.agent_run.thread_id) and the specialist runs on a drillable thread.
  thread_id: z.string().uuid().optional(),
});

export type TaskJobEnvelope = z.infer<typeof taskJobEnvelopeSchema>;

/** We never claimed the task (checkout conflict) — every downstream step no-ops. */
export function isSkippedEnvelope(env: TaskJobEnvelope): boolean {
  return env.status === "skipped";
}
