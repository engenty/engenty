// Deterministic steps of the Task Job workflow — the Paperclip-style coordination
// record updates around the specialist run. Each resolves the service scope and a
// module-operation invoker from env (no secrets in the workflow snapshot) and
// touches the Task via `modules/tasks` operations. The specialist (agent-loop)
// step lives separately in task-job-specialist-step.ts.
import { createHash } from "node:crypto";
import { createStep } from "@mastra/core/workflows";
import { emitInboxNotification } from "../../notifications/inbox.js";
import { EngentyCoreHttpError } from "../core-http-client.js";
import { mergeApprovalGrants } from "../sessions/connection-approval-grants.js";
import { createScopeModuleOperationInvoker } from "../sessions/task-workspace-hook.js";
import {
  routineEntityRef,
  routineWorkspaceStoragePrefix,
} from "./routine-continuity.js";
import { parseRoutineDisposition } from "./routine-disposition.js";
import { summarizeTaskResultHeadline } from "./summarize-result-headline.js";
import { buildTaskBrief } from "./task-brief.js";
import { finishTaskJobRun, registerTaskJobRun } from "./task-job-run-record.js";
import {
  isSkippedEnvelope,
  taskJobEnvelopeSchema,
  taskJobInputSchema,
} from "./task-job-schema.js";
import { resolveTaskJobServiceScope } from "./task-job-scope.js";
import {
  buildPriorLearningsSection,
  entityRefsFromContexts,
} from "./task-prior-learnings.js";

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
 * The run's thread id, derived deterministically (UUIDv5-style, sha1 over the
 * run id) instead of randomly. `checkout` is idempotent and may re-execute when
 * a crash lands between the checkout call and the step snapshot; a random id
 * would mint a second `ai.thread` on that retry and repoint the run record at a
 * thread the run never used. Same run id → same thread id → the upsert is a
 * no-op on resume.
 */
function threadIdForRun(runId: string): string {
  const h = createHash("sha1")
    .update(`engenty:task-job:${runId}`)
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
    try {
      await invoke("tasks_checkout", {
        agent_id: inputData.agent_type_key,
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
    // workflow run id checkout just bound as checkout_run_id.
    const threadId = threadIdForRun(runId);
    await registerTaskJobRun({
      agentTypeKey: inputData.agent_type_key,
      runId,
      scope,
      taskId: inputData.task_id,
      threadId,
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
    // Durable tool-approval grants: task-scoped ∪ one-shot ∪ routine-scoped.
    // Read here so the specialist's "request" pre-gate lets pre-approved ops
    // through; the one-shot list is consumed (cleared) for this run.
    const taskRow = task as {
      approval_grants?: string[];
      approval_grants_once?: string[];
      trigger_id?: string | null;
    };
    const routineWorkspacePrefix = taskRow.trigger_id
      ? routineWorkspaceStoragePrefix(inputData.tenant_id, taskRow.trigger_id)
      : undefined;
    const brief = buildTaskBrief({
      ...(task as Parameters<typeof buildTaskBrief>[0]),
      trigger_id: taskRow.trigger_id ?? null,
      ...(routineWorkspacePrefix
        ? { routine_workspace_prefix: routineWorkspacePrefix }
        : {}),
    });
    const taskGrants = mergeApprovalGrants(
      taskRow.approval_grants ?? [],
      taskRow.approval_grants_once ?? []
    );
    if ((taskRow.approval_grants_once ?? []).length > 0) {
      await invoke("tasks_clear_once_approvals", {
        id: inputData.task_id,
      }).catch(() => {
        // Best-effort: worst case a once-grant survives into one extra run.
      });
    }
    let approvalGrants = taskGrants;
    if (taskRow.trigger_id) {
      const trigger = (await invoke("triggers_get", {
        id: taskRow.trigger_id,
      }).catch(() => null)) as { approval_grants?: string[] } | null;
      approvalGrants = mergeApprovalGrants(
        taskGrants,
        trigger?.approval_grants ?? []
      );
    }
    // Memory Phase 2b: start the run from what earlier runs learned. The
    // section is fail-open and empty when the tenant has no memories.
    const contexts =
      (
        task as {
          contexts?: Array<{ context_id?: unknown; context_type?: unknown }>;
        }
      ).contexts ?? [];
    const learnings = await buildPriorLearningsSection({
      agentTypeKey: inputData.agent_type_key,
      contexts,
      entityRefs: [
        ...entityRefsFromContexts(contexts),
        ...(taskRow.trigger_id ? [routineEntityRef(taskRow.trigger_id)] : []),
      ],
      invoke,
    });
    return {
      ...inputData,
      approval_grants: approvalGrants,
      brief: learnings ? `${brief}\n\n${learnings}` : brief,
      identifier: readString((task as { identifier?: unknown }).identifier),
      status: "briefed" as const,
      title: readString((task as { title?: unknown }).title),
      trigger_id: taskRow.trigger_id ?? null,
    };
  },
});

// 4) Record the specialist's result as a task comment (its output). Preserves the
// ran/failed status for the finalize step. (Step 3 is the specialist run.)
// Routine quiet disposition: no comment at all.
export const writeResultStep = createStep({
  id: "write-result",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData }) => {
    if (isSkippedEnvelope(inputData)) {
      return inputData;
    }
    const invoke = await invokerFor(inputData.tenant_id);
    const failed = inputData.status === "failed";
    const needsApproval = inputData.status === "needs_approval";
    const isRoutine = Boolean(inputData.trigger_id);
    let runDisposition = inputData.run_disposition;
    let resultText = inputData.result_text;

    if (!(failed || needsApproval) && isRoutine) {
      const parsed = parseRoutineDisposition(inputData.result_text);
      runDisposition = parsed.disposition;
      resultText = parsed.cleanedText;
      if (parsed.disposition === "quiet") {
        // Fully suppressed — run row only, no comment.
        return {
          ...inputData,
          result_text: resultText,
          run_disposition: runDisposition,
        };
      }
      if (parsed.disposition === "review" && parsed.reviewReason) {
        const body = parsed.cleanedText.includes(parsed.reviewReason)
          ? parsed.cleanedText
          : [parsed.cleanedText, parsed.reviewReason]
              .filter(Boolean)
              .join("\n");
        resultText = body;
      }
    }

    let body: string;
    if (failed) {
      body = `run failed — ${inputData.note ?? "unknown error"}`;
    } else if (needsApproval) {
      const ops = (inputData.pending_approvals ?? [])
        .map((p) => `\`${p.operation_id}\``)
        .join(", ");
      body = `⏸ Waiting for approval to run ${ops || "a tool"} — approve from the inbox or on this task.`;
    } else {
      body = readString(resultText) || "Run completed.";
    }
    await invoke("tasks_add_comment", {
      content: `🤖 ${inputData.agent_type_key}: ${body}`,
      created_by_agent_type_key: inputData.agent_type_key,
      id: inputData.task_id,
    });
    return {
      ...inputData,
      ...(resultText === undefined ? {} : { result_text: resultText }),
      ...(runDisposition ? { run_disposition: runDisposition } : {}),
    };
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
    const failed = inputData.status === "failed";
    const isRoutine = Boolean(inputData.trigger_id);
    const disposition =
      isRoutine && !(failed || needsApproval)
        ? (inputData.run_disposition ?? "report")
        : null;

    const outcome = failed
      ? ("failed" as const)
      : needsApproval
        ? ("needs_approval" as const)
        : disposition === "quiet"
          ? ("completed_quiet" as const)
          : ("completed" as const);

    // Routine quiet/report rest in backlog; review parks at in_review after
    // release (release resting_status is backlog, then status update → in_review).
    // Non-routine completed → release to todo then flip to in_review (unchanged).
    const restingStatus =
      isRoutine && (disposition === "quiet" || disposition === "report")
        ? "backlog"
        : isRoutine && disposition === "review"
          ? "backlog"
          : "todo";

    await invoke("tasks_release", {
      actor_agent_type_key: inputData.agent_type_key,
      agent_run_id: runId,
      id: inputData.task_id,
      outcome,
      pending_approval_operation_ids: needsApproval
        ? (inputData.pending_approvals ?? []).map((p) => p.operation_id)
        : [],
      resting_status: restingStatus,
    });

    const nextStatus =
      failed || needsApproval
        ? "blocked"
        : disposition === "quiet" || disposition === "report"
          ? "backlog"
          : disposition === "review"
            ? "in_review"
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
    });
    const taskRef = inputData.identifier ?? inputData.task_id;
    const subjectTitle = inputData.title?.trim() || null;

    if (needsApproval) {
      const pendings = inputData.pending_approvals ?? [];
      const primaryOp = pendings[0]?.operation_id ?? "a tool";
      const operationIds = pendings.map((p) => p.operation_id);
      await emitInboxNotification({
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
          ...(inputData.trigger_id ? { trigger_id: inputData.trigger_id } : {}),
        },
        priority: "high",
        source: "tasks",
        summary: subjectTitle ?? `approval to run ${primaryOp}`,
        tenantId: inputData.tenant_id,
      });
      return { ...inputData, status: "released" as const };
    }

    // Quiet routine runs: no notification.
    if (disposition === "quiet") {
      return { ...inputData, status: "released" as const };
    }

    const headline = inputData.result_text
      ? await summarizeTaskResultHeadline({
          resultText: inputData.result_text,
          taskRef,
        })
      : null;

    // Review disposition: needs-input lane (human must clear in_review).
    if (disposition === "review") {
      await emitInboxNotification({
        dedupeKey: `task:${inputData.task_id}:${runId}`,
        kind: "task_review_requested",
        metadata: {
          agent_type_key: inputData.agent_type_key,
          run_id: runId,
          task_id: inputData.task_id,
          ...(inputData.thread_id ? { thread_id: inputData.thread_id } : {}),
          ...(inputData.trigger_id ? { trigger_id: inputData.trigger_id } : {}),
        },
        ...(inputData.result_text
          ? { payload: { result_text: inputData.result_text.slice(0, 2000) } }
          : {}),
        priority: "high",
        source: "tasks",
        summary: headline ?? subjectTitle ?? `Task ${taskRef}`,
        tenantId: inputData.tenant_id,
      });
      return { ...inputData, status: "released" as const };
    }

    await emitInboxNotification({
      dedupeKey: `task:${inputData.task_id}:${runId}`,
      kind: failed ? "task_failed" : "task_completed",
      metadata: {
        agent_type_key: inputData.agent_type_key,
        run_id: runId,
        task_id: inputData.task_id,
        ...(inputData.thread_id ? { thread_id: inputData.thread_id } : {}),
      },
      ...(inputData.result_text
        ? { payload: { result_text: inputData.result_text.slice(0, 2000) } }
        : {}),
      priority: failed ? "high" : "medium",
      source: "tasks",
      summary: headline ?? subjectTitle ?? `Task ${taskRef}`,
      tenantId: inputData.tenant_id,
    });
    return { ...inputData, status: "released" as const };
  },
});
