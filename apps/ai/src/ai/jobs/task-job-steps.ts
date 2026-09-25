// Deterministic steps of the Task Job workflow — the Paperclip-style coordination
// record updates around the specialist run. Each resolves the service scope and a
// module-operation invoker from env (no secrets in the workflow snapshot) and
// touches the Task via `modules/tasks` operations. The specialist (agent-loop)
// step lives separately in task-job-specialist-step.ts.
import { createHash } from "node:crypto";
import { humanizeOperationId } from "@engenty/notifications";
import { createStep } from "@mastra/core/workflows";
import {
  emitInboxNotification,
  resolveNotifications,
} from "../../notifications/inbox.js";
import { failureLine } from "../../notifications/run-notifications.js";
import { EngentyCoreHttpError } from "../core-http-client.js";
import { createScopeModuleOperationInvoker } from "../sessions/task-workspace-hook.js";
import {
  summarizeApprovalRequest,
  summarizeTaskResultHeadline,
} from "./summarize-result-headline.js";
import { buildTaskBrief } from "./task-brief.js";
import {
  resolveTaskCompletionPolicy,
  taskCompletionPolicyDepsFromEnv,
} from "./task-completion-policy.js";
import { finishTaskJobRun, registerTaskJobRun } from "./task-job-run-record.js";
import {
  isSkippedEnvelope,
  taskJobEnvelopeSchema,
  taskJobInputSchema,
} from "./task-job-schema.js";
import { resolveTaskJobServiceScope } from "./task-job-scope.js";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isCheckoutConflict(error: unknown): boolean {
  if (error instanceof EngentyCoreHttpError) {
    return error.status === 409 || error.code === "task_checkout_conflict";
  }
  return error instanceof Error && error.message === "task_checkout_conflict";
}

/**
 * The thread an executor works this task on, derived deterministically
 * (UUIDv5-style, sha1) from the TASK and the ACTOR rather than from the run.
 *
 * Keyed per run, every dispatch minted a fresh `ai.thread`, so an agent picking
 * the same task back up after a question, an approval or a crash started from
 * nothing — the brief was the only carrier of context and anything learned in
 * the previous run was gone. Keyed per (task, actor) the same agent keeps ONE
 * working memory across dispatches, which is what a person doing the task would
 * have. The brief still renders every run (it carries live task state and is
 * the cold-start path for a new agent, a human takeover or a post-deploy run).
 *
 * The actor is in the key, not just the task: reassignment must NOT hand the
 * new agent the old one's notes. A successor inherits the task_comments record,
 * exactly as a human successor does, and starts its own thread.
 *
 * Determinism still buys what it bought before: `checkout` is idempotent and
 * may re-execute when a crash lands between the checkout call and the step
 * snapshot, and a random id would repoint the run record at a thread the run
 * never used.
 */
function threadIdForTaskActor(taskId: string, actorId: string): string {
  const h = createHash("sha1")
    .update(`engenty:task-thread:${taskId}:${actorId}`)
    .digest("hex");
  // RFC 4122 variant nibble must be 8-b; pick one deterministically from the
  // hash without bitwise ops (lint policy).
  const variant = "89ab"[Number.parseInt(h[16] ?? "0", 16) % 4];
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`,
    `${variant}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join("-");
}

async function invokerFor(tenantId: string) {
  const scope = await resolveTaskJobServiceScope(tenantId);
  return createScopeModuleOperationInvoker(scope);
}

// 1) Claim the task for this workflow run. `checkout_run_id` becomes the run id,
// status → in_progress, and a `task_runs` row is written. A 409 means another
// run already owns it — mark `skipped` so every downstream step no-ops.
export const checkoutStep = createStep({
  id: "checkout",
  inputSchema: taskJobInputSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData, runId }) => {
    const scope = await resolveTaskJobServiceScope(inputData.tenant_id);
    const invoke = createScopeModuleOperationInvoker(scope);
    // Checkout records WHO holds the task. This lane only ever runs a
    // task-subject run — somebody assigned the work item to a specialist — so
    // the specialist IS the actor and a task without one has nothing to run.
    const actorId = inputData.agent_type_key;
    if (!actorId) {
      throw new Error(
        `task-job: task ${inputData.task_id} has no specialist assigned to run it`
      );
    }
    try {
      await invoke("tasks_checkout", {
        agent_id: actorId,
        agent_run_id: runId,
        id: inputData.task_id,
      });
    } catch (error) {
      if (isCheckoutConflict(error)) {
        return {
          ...inputData,
          note: "task already checked out by another run",
          status: "skipped" as const,
        };
      }
      throw error;
    }
    // Register the run as first-class (ai.thread + ai.agent_run, status running)
    // so the task's run-history card has a real lifecycle. The run id is the
    // workflow run id checkout just bound as checkout_run_id; the THREAD is the
    // actor's standing one for this task, so run N opens on run N-1's memory.
    const threadId = threadIdForTaskActor(inputData.task_id, actorId);
    await registerTaskJobRun({
      agentTypeKey: actorId,
      runId,
      scope,
      taskId: inputData.task_id,
      threadId,
      ...(inputData.started_by ? { startedBy: inputData.started_by } : {}),
    });
    return {
      ...inputData,
      status: "checked_out" as const,
      thread_id: threadId,
    };
  },
});

// 2) Read the task and render the brief the specialist opens with.
export const buildBriefStep = createStep({
  id: "build-brief",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData }) => {
    if (isSkippedEnvelope(inputData)) {
      return inputData;
    }
    const invoke = await invokerFor(inputData.tenant_id);
    const task = (await invoke("tasks_get", { id: inputData.task_id })) ?? {};
    // Durable tool-approval grants: task-scoped ∪ one-shot. Read here so the
    // specialist's "request" pre-gate lets pre-approved ops through; the
    // one-shot list is consumed (cleared) for this run.
    const taskRow = task as {
      primary_assignee_user_id?: string | null;
      space_id?: string | null;
    };
    const brief = buildTaskBrief(task as Parameters<typeof buildTaskBrief>[0]);
    // Effective grant set for the run's pre-gate, computed by the tasks
    // module from the core approval store — the legacy task-row columns are no
    // longer read. Once-grants stay live in core so a
    // core-side gate can spend them DURING the run; write-result reaps the
    // ones nobody spent. A failed read grants nothing (fail closed): the op
    // gates again rather than running unapproved.
    const effective = (await invoke("tasks_approval_grants_effective", {
      id: inputData.task_id,
    }).catch(() => null)) as { approval_grants?: string[] } | null;
    const approvalGrants = effective?.approval_grants ?? [];
    return {
      ...inputData,
      approval_grants: approvalGrants,
      assignee_user_id: taskRow.primary_assignee_user_id ?? null,
      brief,
      identifier: readString((task as { identifier?: unknown }).identifier),
      space_id: taskRow.space_id ?? null,
      status: "briefed" as const,
      title: readString((task as { title?: unknown }).title),
    };
  },
});

// 4) Record the specialist's result as a task comment (its output). Preserves the
// ran/failed status for the finalize step. (Step 3 is the specialist run.)
export const writeResultStep = createStep({
  id: "write-result",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData }) => {
    if (isSkippedEnvelope(inputData)) {
      return inputData;
    }
    const invoke = await invokerFor(inputData.tenant_id);
    // End the one-shot grants this run was dispatched with. Core once-rows
    // outlive dispatch on purpose (a gate may spend them mid-run); this is
    // where the unspent ones die. Same placement contract as the old
    // dispatch-time column clear: best-effort, worst case a once-grant
    // survives into one extra run.
    await invoke("tasks_clear_once_approvals", {
      id: inputData.task_id,
    }).catch(() => {
      // Best-effort by design.
    });
    const failed = inputData.status === "failed";
    const needsApproval = inputData.status === "needs_approval";
    const needsInput = inputData.status === "needs_input";
    // Whatever earlier runs announced about this task is settled by this one
    // before it speaks: a success closes the failure alert, a park replaces
    // the stale ask.
    await resolveNotifications({
      outcome: failed
        ? "failed"
        : needsApproval || needsInput
          ? "resumed"
          : "completed",
      subjectId: inputData.task_id,
      subjectType: "task",
      tenantId: inputData.tenant_id,
    });
    // The question the agent asked via `task_ask_user` IS the run's output
    // comment — the tool already posted it. Anything more here would double-post.
    if (needsInput && inputData.question) {
      return inputData;
    }
    // A task-subject run always writes its result: the comment IS how the
    // work item reports back to whoever assigned it.
    let body: string;
    if (failed) {
      body = `run failed — ${inputData.note ?? "unknown error"}`;
    } else if (needsInput) {
      // The question first, then whatever the run got done before it stopped —
      // a reader must see what is being asked without hunting for it.
      const question = inputData.blocked_question ?? "more information";
      const done = readString(inputData.result_text);
      body = done
        ? `🙋 Needs your input — ${question}\n\n${done}`
        : `🙋 Needs your input — ${question}`;
    } else if (needsApproval) {
      const ops = (inputData.pending_approvals ?? [])
        .map((p) =>
          p.title
            ? `${p.title} (\`${p.operation_id}\`)`
            : `\`${p.operation_id}\``
        )
        .join(", ");
      body = `⏸ Waiting for approval to run ${ops || "a tool"} — approve from the inbox or on this task.`;
    } else {
      body = readString(inputData.result_text) || "Run completed.";
    }
    await invoke("tasks_add_comment", {
      content: body,
      created_by_agent_type_key: inputData.agent_type_key,
      id: inputData.task_id,
      // `result` is what dependent tasks read to inherit this outcome, and
      // what the panel renders as the run's answer. The agent name used to be
      // prefixed into the text ("🤖 engenty.coordinator: …"); it is already on
      // the row as `created_by_agent_type_key` and rendered as the author.
      kind: needsApproval ? "system" : "result",
    });
    return inputData;
  },
});

// 5) Release the checkout and set the terminal status. release() clears the
// checkout (resetting to resting status), so it MUST precede the status update —
// otherwise it would clobber in_review and re-open the task for dispatch. Both
// ops are idempotent, so a crash-resume re-runs this step safely.
export const finalizeStep = createStep({
  id: "finalize",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData, runId }) => {
    if (isSkippedEnvelope(inputData)) {
      return inputData;
    }
    const invoke = await invokerFor(inputData.tenant_id);
    const needsApproval = inputData.status === "needs_approval";
    const needsInput = inputData.status === "needs_input";
    const failed = inputData.status === "failed";

    const outcome = failed
      ? ("failed" as const)
      : needsApproval
        ? ("needs_approval" as const)
        : needsInput
          ? ("needs_input" as const)
          : ("completed" as const);

    await invoke("tasks_release", {
      actor_agent_type_key: inputData.agent_type_key,
      agent_run_id: runId,
      id: inputData.task_id,
      outcome,
      pending_approval_operation_ids: needsApproval
        ? (inputData.pending_approvals ?? []).map((p) => p.operation_id)
        : [],
      // Release always drops the task back to an entry status; the status
      // update below is what parks it. Order is load-bearing — see the header.
      resting_status: "todo",
    });

    // Does this finished run need a human, or is done simply done? The
    // agent-approval trust dial (tenant → space → agent; the same one that
    // gates risky tools) answers it: `manual` parks the task at in_review
    // with a review to-do, `auto`/`pass-all` closes it and lets dependents
    // dispatch. Only the plain completed lane consults it — failures,
    // approvals and questions keep their lanes.
    const plainCompleted = !(failed || needsApproval || needsInput);
    let completionPolicy: "complete" | "review" = "review";
    if (plainCompleted) {
      const policyDeps = taskCompletionPolicyDepsFromEnv();
      if (policyDeps) {
        completionPolicy = await resolveTaskCompletionPolicy(policyDeps, {
          agentTypeKey: inputData.agent_type_key ?? null,
          spaceId: inputData.space_id ?? null,
          tenantId: inputData.tenant_id,
        });
      }
    }
    const autoComplete = plainCompleted && completionPolicy === "complete";

    // A run that stopped to ASK is waiting on a person, not blocked by another
    // task: `blocked` drops it out of the briefing (which lists todo/in_review/
    // backlog), so the gate, the capability card and the `ask_user` question
    // would all be invisible on the one surface built to answer them. Only a
    // failure rests as blocked.
    const nextStatus = failed
      ? "blocked"
      : needsApproval || needsInput
        ? "in_review"
        : autoComplete
          ? "done"
          : "in_review";

    await invoke("tasks_update", {
      actor_agent_type_key: inputData.agent_type_key,
      id: inputData.task_id,
      status: nextStatus,
    });

    await finishTaskJobRun({
      runId,
      scope: await resolveTaskJobServiceScope(inputData.tenant_id),
      status: failed ? "failed" : "completed",
      // The thread outlives the run now, so it must be put back to REST — a
      // per-run thread could be abandoned mid-status, a standing one shows up
      // in every thread list until something settles it.
      ...(inputData.thread_id ? { threadId: inputData.thread_id } : {}),
    });
    const taskRef = inputData.identifier ?? inputData.task_id;
    // The task as a person names it: its title, else its identifier (ENG-12).
    const taskName =
      inputData.title?.trim() || inputData.identifier?.trim() || null;

    if (needsApproval) {
      const pendings = inputData.pending_approvals ?? [];
      const primaryOp = pendings[0]?.operation_id ?? "a tool";
      const operationIds = pendings.map((p) => p.operation_id);
      // An operation id alone ("connections_execute_action") says nothing about
      // what is about to happen, so the card would ask for a blind yes. Carry
      // the per-operation labels, and summarize the agent's notes into one line
      // that states the concrete action awaiting approval.
      const approvalHeadline = await summarizeApprovalRequest({
        operations: pendings.map((p) => p.title ?? p.operation_id),
        resultText: inputData.result_text ?? "",
        taskRef,
      });
      // The operation as words: the gated call's own label when it has one,
      // else its id humanized. Never the raw id.
      const primaryLabel =
        pendings[0]?.title?.trim() ||
        (pendings[0]?.operation_id
          ? humanizeOperationId(pendings[0].operation_id)
          : "a tool");
      await emitInboxNotification({
        // The task's agent asks; `{actor}` resolves to its name at emit.
        ...(inputData.agent_type_key
          ? { actor: { id: inputData.agent_type_key, kind: "agent" as const } }
          : {}),
        assigneeUserId: inputData.assignee_user_id ?? null,
        // What is about to happen, in one line (present tense, no ids).
        ...(approvalHeadline ? { body: approvalHeadline } : {}),
        dedupeKey: `tool-approval:${inputData.task_id}:${primaryOp}`,
        kind: "tool_approval",
        metadata: {
          agent_type_key: inputData.agent_type_key,
          operation_id: primaryOp,
          operation_ids: operationIds,
          run_id: runId,
          task_id: inputData.task_id,
          task_identifier: inputData.identifier ?? null,
          ...(inputData.thread_id ? { thread_id: inputData.thread_id } : {}),
        },
        payload: {
          approvals: pendings,
          ...(approvalHeadline ? { approval_summary: approvalHeadline } : {}),
          // The run's notes, for the approval card on the task page (the
          // place this is decided); the bell shows only the one-line body.
          ...(inputData.result_text
            ? { result_text: inputData.result_text.slice(0, 2000) }
            : {}),
        },
        priority: "high",
        source: "tasks",
        spaceId: inputData.space_id ?? null,
        // The answer comes back on the task and re-dispatch is a new run, so
        // the task is the subject a resolve can find.
        subject: { id: inputData.task_id, type: "task" },
        summary: `Approval needed to use ${primaryLabel}`,
        tenantId: inputData.tenant_id,
        title: { key: "tool_approval", params: { operation: primaryLabel } },
      });
      return { ...inputData, status: "released" as const };
    }

    // The agent asked and stopped. Same lane as an approval — nothing moves
    // until a person answers — but the answer is a reply comment, not a grant,
    // so the notification points at the task rather than carrying a decision.
    if (needsInput) {
      const asked = inputData.question?.trim();
      const blocked = inputData.blocked_question ?? "";
      const question = asked || blocked;
      const viaTool = Boolean(asked);
      await emitInboxNotification({
        ...(inputData.agent_type_key
          ? { actor: { id: inputData.agent_type_key, kind: "agent" as const } }
          : {}),
        assigneeUserId: inputData.assignee_user_id ?? null,
        // The question IS what the row is for; the title says which task.
        ...(question ? { body: question } : {}),
        dedupeKey: viaTool
          ? `task-question:${inputData.task_id}:${runId}`
          : `task-needs-input:${inputData.task_id}:${runId}`,
        kind: viaTool ? "task_question" : "task_needs_input",
        metadata: {
          agent_type_key: inputData.agent_type_key,
          run_id: runId,
          task_id: inputData.task_id,
          task_identifier: inputData.identifier ?? null,
          ...(inputData.thread_id ? { thread_id: inputData.thread_id } : {}),
        },
        ...(question ? { payload: { question } } : {}),
        priority: "high",
        source: "tasks",
        spaceId: inputData.space_id ?? null,
        subject: { id: inputData.task_id, type: "task" },
        summary: viaTool ? "A task has a question" : "A task needs your input",
        tenantId: inputData.tenant_id,
        ...(taskName
          ? {
              title: {
                key: viaTool ? "task_question" : "task_needs_input",
                params: { task: taskName },
              },
            }
          : {}),
      });
      return { ...inputData, status: "released" as const };
    }

    const headline = inputData.result_text
      ? await summarizeTaskResultHeadline({
          resultText: inputData.result_text,
          taskRef,
        })
      : null;

    // A task parked at in_review is BLOCKING work (its dependents stay
    // blocked until a human clears it) — that is a to-do, and it rides the
    // review kind the inbox and briefing already treat as one. Only a task
    // that actually completed announces itself as completed.
    const parkedForReview = !failed && nextStatus === "in_review";
    const terminalKind = failed
      ? ("task_failed" as const)
      : parkedForReview
        ? ("task_review_requested" as const)
        : ("task_completed" as const);
    // One line under the title: what went wrong, or what got done.
    const terminalBody = failed ? failureLine(inputData.note) : headline;
    await emitInboxNotification({
      ...(inputData.agent_type_key
        ? { actor: { id: inputData.agent_type_key, kind: "agent" as const } }
        : {}),
      assigneeUserId: inputData.assignee_user_id ?? null,
      ...(terminalBody ? { body: terminalBody } : {}),
      dedupeKey: `task:${inputData.task_id}:${runId}`,
      kind: terminalKind,
      metadata: {
        agent_type_key: inputData.agent_type_key,
        run_id: runId,
        task_id: inputData.task_id,
        task_identifier: inputData.identifier ?? null,
        ...(inputData.thread_id ? { thread_id: inputData.thread_id } : {}),
      },
      priority: failed || parkedForReview ? "high" : "medium",
      source: "tasks",
      spaceId: inputData.space_id ?? null,
      // A failure or review points at the task (a retry resolves it); a plain
      // completion is FYI about this run.
      subject:
        failed || parkedForReview
          ? { id: inputData.task_id, type: "task" }
          : { id: runId, type: "run" },
      summary: failed
        ? "A task failed"
        : parkedForReview
          ? "A task is ready for review"
          : "A task is done",
      tenantId: inputData.tenant_id,
      ...(taskName
        ? { title: { key: terminalKind, params: { task: taskName } } }
        : {}),
    });
    return { ...inputData, status: "released" as const };
  },
});
