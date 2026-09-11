// Mirror a flow run's outcome onto the Task that supervises it
// (PLAN-workflow-designer.md Phase 6, D3).
//
// Why this exists: a flow run can settle long after the task job's step
// returned — a gate answered the next morning, a `wait_until` woken by the
// sweep three days later. Both paths update `ai.workflow_run` and neither has
// any idea a Task is watching. Without this mirror the board would keep showing
// work the system already finished, which is precisely the failure Variant D
// was chosen to avoid.
//
// Two rules shape it:
//
// 1. **Fail-open, always.** The flow already ran; its effects are real and its
//    audit row is authoritative. A board that lags is a nuisance, but an
//    exception thrown here would fail a resume path and could roll back a
//    completed run. Every failure is logged and swallowed.
// 2. **Through the module gateway, never the tasks tables.** apps/ai does not
//    own `module_tasks` and must not write it directly — same rule the task-job
//    steps already follow.
import { createLogger } from "@engenty/telemetry";
import { resolveTaskJobServiceScope } from "../jobs/task-job-scope.js";
import { createScopeModuleOperationInvoker } from "../sessions/task-workspace-hook.js";

const logger = createLogger({ name: "graph-action-task-mirror" });

/** What happened to the flow, in the vocabulary the board needs. */
export type FlowSettleKind = "completed" | "failed" | "gated";

export interface MirrorFlowSettleInput {
  /** Free-text detail — a gate title, a failure reason. */
  detail?: string | null;
  kind: FlowSettleKind;
  taskId: string;
  tenantId: string;
}

/**
 * Bring the supervising task in line with its flow run.
 *
 * `completed` closes the task; `failed` blocks it for a human; `gated` parks it
 * in review because someone must answer before anything else happens. A
 * SLEEPING run is deliberately not a kind here: its task is resting on purpose,
 * and the settle path simply doesn't call this.
 */
export async function mirrorFlowSettleToTask(
  input: MirrorFlowSettleInput
): Promise<void> {
  try {
    const scope = await resolveTaskJobServiceScope(input.tenantId);
    const invoke = createScopeModuleOperationInvoker(scope);

    const comment = commentFor(input);
    if (comment) {
      // `tasks_add_comment`, and the task is `id` — this used to call a
      // `tasks_comment_create` op that does not exist, so every flow-settle
      // comment failed into the warn below and no flow ever reported itself.
      await invoke("tasks_add_comment", {
        content: comment,
        id: input.taskId,
        // Nobody typed this — it is the flow's lifecycle speaking.
        kind: "system",
      }).catch((err: unknown) => {
        // A missing comment must not stop the status change below — the status
        // is what the board reads.
        logger.warn("flow settle comment failed", {
          error: err instanceof Error ? err.message : String(err),
          taskId: input.taskId,
        });
      });
    }

    await invoke("tasks_update", {
      id: input.taskId,
      status: statusFor(input.kind),
    });
    logger.info("mirrored flow settle to task", {
      kind: input.kind,
      taskId: input.taskId,
      tenantId: input.tenantId,
    });
  } catch (err) {
    // Fail-open: see rule 1 above.
    logger.warn("flow settle mirror failed", {
      error: err instanceof Error ? err.message : String(err),
      kind: input.kind,
      taskId: input.taskId,
      tenantId: input.tenantId,
    });
  }
}

/**
 * A nested invoke_workflow finished after its parent agent run had parked at a
 * gate. The Task itself is not complete: return it to todo and dispatch the
 * agent so it can continue from the durable comment/audit trail.
 */
export async function resumeTaskAfterNestedFlow(input: {
  detail?: string | null;
  failed: boolean;
  taskId: string;
  tenantId: string;
}): Promise<void> {
  if (input.failed) {
    await mirrorFlowSettleToTask({
      detail: input.detail,
      kind: "failed",
      taskId: input.taskId,
      tenantId: input.tenantId,
    });
    return;
  }
  try {
    const scope = await resolveTaskJobServiceScope(input.tenantId);
    const invoke = createScopeModuleOperationInvoker(scope);
    await invoke("tasks_add_comment", {
      content: "Nested flow completed. Resuming the Task.",
      id: input.taskId,
      kind: "system",
    });
    await invoke("tasks_update", { id: input.taskId, status: "todo" });
    await invoke("tasks_run_now", { id: input.taskId });
  } catch (err) {
    logger.warn("nested flow task resume failed", {
      error: err instanceof Error ? err.message : String(err),
      taskId: input.taskId,
      tenantId: input.tenantId,
    });
  }
}

export interface MirrorFlowDecisionInput {
  /** Who answered. Recorded as comment metadata — `tasks_add_comment` credits
   * the CALLER as author, and the caller here is the service principal, so
   * claiming authorship would be a lie while dropping it loses the record. */
  answeredByUserId?: string | null;
  approved: boolean;
  /** The gate's own question, when the resume knows it. */
  question?: string | null;
  /** Free-text reason a person typed with the decision. */
  reason?: string | null;
  taskId: string;
  tenantId: string;
}

/**
 * Record a gate DECISION on the task (Phase 8 P8-1).
 *
 * The question already lands here as a comment when the flow suspends; the
 * answer did not, so the thread held half a conversation. That asymmetry is
 * harmless while every pause parks on the row — and load-bearing the moment a
 * run can be SUSPENDED instead (tier 1): a suspended run that later has to
 * degrade to the park path must find the answer in the comments, because the
 * snapshot it would have resumed from may be gone. Writing both halves in both
 * tiers is what makes that degradation lossless.
 *
 * Fail-open like the settle mirror: the decision has already been applied to
 * the run by the time this is called.
 */
export async function mirrorFlowDecisionToTask(
  input: MirrorFlowDecisionInput
): Promise<void> {
  try {
    const scope = await resolveTaskJobServiceScope(input.tenantId);
    const invoke = createScopeModuleOperationInvoker(scope);
    const question = input.question?.trim();
    const reason = input.reason?.trim();
    const content = [
      input.approved ? "✅ Approved" : "🚫 Rejected",
      question ? `: ${question}` : "",
      reason ? `\n\n${reason}` : "",
    ].join("");
    await invoke("tasks_add_comment", {
      content,
      id: input.taskId,
      // Nobody typed this text — the flow's lifecycle is reporting an answer.
      kind: "system",
      ...(input.answeredByUserId
        ? { metadata: { answered_by_user_id: input.answeredByUserId } }
        : {}),
    });
  } catch (err) {
    logger.warn("flow decision comment failed", {
      error: err instanceof Error ? err.message : String(err),
      taskId: input.taskId,
      tenantId: input.tenantId,
    });
  }
}

function statusFor(kind: FlowSettleKind): string {
  if (kind === "completed") {
    return "done";
  }
  if (kind === "gated") {
    return "in_review";
  }
  return "blocked";
}

function commentFor(input: MirrorFlowSettleInput): string | null {
  const detail = input.detail?.trim();
  if (input.kind === "completed") {
    return detail ? `Flow completed.\n\n${detail}` : "Flow completed.";
  }
  if (input.kind === "failed") {
    return detail ? `Flow failed: ${detail}` : "Flow failed.";
  }
  return detail
    ? `Flow is waiting for approval: ${detail}`
    : "Flow is waiting for approval.";
}
