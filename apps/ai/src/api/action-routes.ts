// Phase 5 — Action invocation + history routes.
//   POST /ai/v1/actions/:actionId/run  — run an Action against a subject, as a
//     durable Action Job (Mastra workflow). Per-subject dedup: an in-flight run
//     for the same (action, context) returns the existing run instead of starting
//     a second. Different subjects run concurrently (A ∥ B).
//   GET  /ai/v1/actions/:actionId/requests — per-subject run history (audit rows).

import { randomUUID } from "node:crypto";
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import type { Hono } from "hono";
import { mastra } from "../../ai/index.js";
import { ACTION_JOB_WORKFLOW_ID } from "../../ai/workflows/action-job-workflow.js";
import { buildActionBrief } from "../ai/jobs/action-brief.js";
import { registerActionRun } from "../ai/jobs/action-job-run-record.js";
import { resolveActionById } from "../ai/module-actions.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { ActionRequestStore } from "../dal/action-requests/action-request-store.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

export interface RegisterActionRoutesOptions {
  getActionRequestStore: () => ActionRequestStore | null;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  scopeResolver: AiScopeResolver;
}

function readContext(body: unknown): {
  contextId: string | null;
  contextType: string | null;
} {
  const ctx = (body as { context?: { id?: unknown; type?: unknown } })?.context;
  const type = typeof ctx?.type === "string" ? ctx.type.trim() : "";
  const id = typeof ctx?.id === "string" ? ctx.id.trim() : "";
  return { contextId: id || null, contextType: type || null };
}

export function registerActionRoutes(
  app: Hono<any>,
  options: RegisterActionRoutesOptions
) {
  const { scopeResolver, moduleLoader, getActionRequestStore } = options;

  app.post(`${AI_BASE_PATH}/v1/actions/:actionId/run`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const scope = resolved.scope;
    const actionId = c.req.param("actionId");
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const { contextId, contextType } = readContext(body);
      // Constrained by ai.action_request_trigger_check
      // (message|command|button|cron|hook|direct).
      const trigger =
        typeof body.trigger === "string" ? body.trigger : "button";

      const action = await resolveActionById(actionId, moduleLoader);
      if (!action) {
        return c.json({ error: "action_not_found" }, 404);
      }

      const parsed = action.input_schema.safeParse(body.input ?? {});
      if (!parsed.success) {
        return c.json(
          { error: "action_input_invalid", issues: parsed.error.issues },
          400
        );
      }
      const input = parsed.data as Record<string, unknown>;

      const store = getActionRequestStore();
      // Per-subject dedup: a run already in flight for this (action, subject)
      // wins — return it instead of starting a duplicate.
      if (store && (contextId || contextType)) {
        const active = await store.findActive({
          actionId,
          contextId,
          contextType,
          tenantId: scope.tenantId,
        });
        if (active?.run_id && active?.thread_id) {
          return c.json({
            deduped: true,
            run_id: active.run_id,
            thread_id: active.thread_id,
          });
        }
      }

      const runId = randomUUID();
      const threadId = randomUUID();
      const requestId = randomUUID();

      // Create the run's thread + ai.agent_run (attributed to the caller), then
      // the action_request audit/dedup row — before the workflow starts.
      await registerActionRun({
        actionId,
        agentId: action.agent_id,
        contextId,
        contextType,
        runId,
        scope,
        threadId,
      });
      await store?.create({
        actionId,
        agentId: action.agent_id,
        contextId,
        contextType,
        id: requestId,
        payload: input,
        runId,
        tenantId: scope.tenantId,
        threadId,
        trigger,
      });

      const brief = buildActionBrief({
        context_id: contextId,
        context_type: contextType,
        input,
        prompt: action.prompt,
      });
      const run = await mastra.getWorkflow(ACTION_JOB_WORKFLOW_ID).createRun({
        runId,
      });
      await run.startAsync({
        inputData: {
          action_id: actionId,
          agent_id: action.agent_id,
          brief,
          request_id: requestId,
          tenant_id: scope.tenantId,
          thread_id: threadId,
          ...(action.allowed_tools
            ? { allowed_tools: action.allowed_tools }
            : {}),
          ...(contextType ? { context_type: contextType } : {}),
          ...(contextId ? { context_id: contextId } : {}),
        },
      });

      return c.json({ run_id: runId, thread_id: threadId });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to run action",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/v1/actions/:actionId/requests`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const actionId = c.req.param("actionId");
    try {
      const store = getActionRequestStore();
      if (!store) {
        return c.json({ requests: [] });
      }
      const contextType = c.req.query("context_type") || null;
      const contextId = c.req.query("context_id") || null;
      const rows = await store.list({
        actionId,
        contextId,
        contextType,
        tenantId: resolved.scope.tenantId,
      });
      return c.json({ requests: rows });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list action requests",
        "agent_sessions.internalError",
        err
      );
    }
  });

  // Resolve a proposeUpdates approval by RESUMING the suspended action-job
  // workflow with the user's decision. The workflow's apply-updates step writes
  // the approved patch (generically, by context_type) and finalize completes the
  // run — the apply is part of the durable flow, not an out-of-band write.
  app.post(`${AI_BASE_PATH}/v1/actions/:actionId/approve`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const actionId = c.req.param("actionId");
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        approved?: Array<{ field?: unknown; value?: unknown }>;
        context?: { id?: unknown; type?: unknown };
        rejected?: boolean;
        run_id?: unknown;
      };
      // The run to resume: prefer an explicit run_id, else the subject's
      // in-flight (suspended) request.
      let runId = typeof body.run_id === "string" ? body.run_id.trim() : "";
      if (!runId) {
        const store = getActionRequestStore();
        const { contextId, contextType } = readContext(body);
        const active = store
          ? await store.findActive({
              actionId,
              contextId,
              contextType,
              tenantId: resolved.scope.tenantId,
            })
          : null;
        runId = active?.run_id ?? "";
      }
      if (!runId) {
        return c.json({ error: "approve.noPendingRun" }, 404);
      }
      const approved = (body.approved ?? [])
        .filter(
          (e): e is { field: string; value: unknown } =>
            typeof e?.field === "string" && e.field.trim().length > 0
        )
        .map((e) => ({
          field: e.field.trim(),
          value: (e.value ?? null) as string | null,
        }));
      const run = await mastra
        .getWorkflow(ACTION_JOB_WORKFLOW_ID)
        .createRun({ runId });
      await run.resumeAsync({
        resumeData: { approved, rejected: body.rejected === true },
        step: "run-action-specialist",
      });
      return c.json({ ok: true, resumed: true, run_id: runId });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to resume action approval",
        "agent_sessions.internalError",
        err
      );
    }
  });
}
