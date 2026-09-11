// Apply the field updates a task's agent proposed.
//
// POST /ai/v1/tasks/:taskId/field-updates — { approved: [{ field, value }] }
//
// In the action lane the approval is a workflow resume: the job suspended on
// `proposeUpdates` and its apply step writes the patch. A flow's specialist does
// NOT suspend — it proposes and finishes, leaving the suggestions on its child
// run with the task holding the decision. So the task path needs its own way to
// say yes, and this is it (PLAN-workflow-designer.md Phase 7 #4).
//
// The write runs as the CALLER, not as the service principal: approving a
// suggestion is a human act, and it must be gated by that human's capabilities
// exactly like editing the record by hand.

import type { Hono } from "hono";
import { createWorkflowRunStoreFromEnv } from "../ai/index.js";
import { applyApprovedFieldUpdates } from "../ai/jobs/apply-field-updates.js";
import { deliverToLiveTaskRun } from "../ai/sessions/live-task-run-registry.js";
import { canReadTask } from "../ai/sessions/task-thread-access.js";
import { createScopeModuleOperationInvoker } from "../ai/sessions/task-workspace-hook.js";
import { AI_BASE_PATH } from "../config/constants.js";
import { resolveNotifications } from "../notifications/inbox.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

/** Trim `{approved: [{field, value}]}` into a patch; empty = nothing approved. */
function approvedPatch(body: {
  approved?: { field?: unknown; value?: unknown }[];
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const entry of body.approved ?? []) {
    if (typeof entry?.field === "string" && entry.field.trim()) {
      patch[entry.field.trim()] = entry.value ?? null;
    }
  }
  return patch;
}

interface TaskDetailRow {
  contexts?: { context_id: string; context_type: string }[];
  id: string;
  identifier?: string;
}

export function registerTaskFieldUpdateRoutes(
  app: Hono<any>,
  options: { scopeResolver: AiScopeResolver }
) {
  // POST /ai/v1/tasks/:taskId/deliver — hand a just-saved comment to the run
  // that is executing this task RIGHT NOW, so the person does not have to wait
  // for it to finish and dispatch again to be heard.
  //
  // The comment is written to `task_comments` by the caller BEFORE this is
  // called, and stays there whatever happens here: this is delivery, never
  // storage. `{delivered: false}` is an ordinary answer (no live run, or the
  // run is on another replica) and the caller falls back to what it did before.
  app.post(`${AI_BASE_PATH}/v1/tasks/:taskId/deliver`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const taskId = c.req.param("taskId");
    const body = (await c.req.json().catch(() => ({}))) as {
      content?: unknown;
    };
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return c.json({ error: "tasks.deliverContentRequired" }, 400);
    }
    // Speaking into a run is at least as strong as reading the task, and the
    // task's own gate is the only rule — asked of core with the CALLER's
    // credential, exactly as the run-transcript gate does.
    if (!(await canReadTask({ scope: resolved.scope, taskId }))) {
      return c.json({ error: "tasks.notFound" }, 404);
    }
    try {
      const delivered = await deliverToLiveTaskRun(taskId, content);
      return c.json({ delivered });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to deliver comment to live run",
        "tasks.deliverFailed",
        err
      );
    }
  });

  // POST /ai/v1/workflow-runs/:runId/field-updates — the run-scoped twin of the
  // task route below, for runs no Task supervises (a button press, an
  // agent-started run: `workflow_run.owner_task_id` is null there by
  // design). Same rule as the task path: the subject comes from the run's OWN
  // audit-row binding, never from the request — a caller who could name the
  // record would otherwise write a patch onto anything by pointing an
  // unrelated run's approval at it. The write runs as the CALLER, gated by
  // their capabilities exactly like editing the record by hand.
  app.post(`${AI_BASE_PATH}/v1/action-runs/:runId/field-updates`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const runId = c.req.param("runId");
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        approved?: { field?: unknown; value?: unknown }[];
      };
      const patch = approvedPatch(body);
      if (Object.keys(patch).length === 0) {
        return c.json({ error: "fieldUpdates.nothingApproved" }, 400);
      }

      const requests = createWorkflowRunStoreFromEnv();
      const request = requests
        ? await requests.getByRunId({
            runId,
            tenantId: resolved.scope.tenantId,
          })
        : null;
      if (!request) {
        return c.json({ error: "fieldUpdates.runNotFound" }, 404);
      }
      if (!(request.context_id && request.context_type)) {
        return c.json({ error: "fieldUpdates.noSubject" }, 400);
      }

      const { applied } = await applyApprovedFieldUpdates({
        contextId: request.context_id,
        contextType: request.context_type,
        patch,
        scope: resolved.scope,
      });
      await resolveNotifications({
        outcome: "resumed",
        subjectId: runId,
        subjectType: "run",
        tenantId: resolved.scope.tenantId,
      });
      return c.json({ applied, ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to apply field updates",
        "fieldUpdates.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/v1/tasks/:taskId/field-updates`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const taskId = c.req.param("taskId");
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        approved?: { field?: unknown; value?: unknown }[];
      };
      const patch = approvedPatch(body);
      if (Object.keys(patch).length === 0) {
        return c.json({ error: "fieldUpdates.nothingApproved" }, 400);
      }

      const invoke = createScopeModuleOperationInvoker(resolved.scope);
      const task = (await invoke("tasks_get", { id: taskId })) as TaskDetailRow;
      // The subject is the task's own binding — never taken from the request.
      // A caller who could name the record would otherwise be able to write a
      // patch onto anything by pointing an unrelated task's approval at it.
      const subject = task.contexts?.[0];
      if (!subject) {
        return c.json({ error: "fieldUpdates.noSubject" }, 400);
      }

      const { applied } = await applyApprovedFieldUpdates({
        contextId: subject.context_id,
        contextType: subject.context_type,
        patch,
        scope: resolved.scope,
      });
      await invoke("tasks_add_comment", {
        content: `Applied ${applied} field update${applied === 1 ? "" : "s"} to ${subject.context_type} ${subject.context_id}:\n\n\`\`\`json\n${JSON.stringify(patch, null, 2)}\n\`\`\``,
        id: taskId,
        // Nobody typed this and no agent is speaking — it is the record of an
        // approval being carried out. Unkinded it defaulted to `note`, so the
        // thread rendered it as a person's comment with no author to show.
        kind: "system",
      });
      return c.json({ applied, ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to apply field updates",
        "fieldUpdates.internalError",
        err
      );
    }
  });
}
