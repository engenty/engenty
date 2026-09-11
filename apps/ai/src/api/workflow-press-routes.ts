// Workflow press + history routes.
//
//   POST /ai/v1/workflows/by-source/:workflowId/run — press a module workflow:
//     ensure its stored graph and dispatch a subject-bound Run. No Task —
//     a press is an invocation. Per-subject dedup lives in the dispatcher.
//   GET  /ai/v1/workflows/by-source/:workflowId/runs — per-subject run history.
//   POST /ai/v1/workflows/by-source/:workflowId/materialize — compile the
//     module workflow into its stored graph without running.

import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import type { Hono } from "hono";
import { mastra } from "../../ai/index.js";
import { createWorkflowStoreFromEnv } from "../ai/index.js";
import { resolveWorkflowById } from "../ai/module-workflows.js";
import {
  assertFlowInput,
  FlowInputMissingError,
  FlowInputShapeError,
} from "../ai/workflows/flow-input.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { WorkflowRunStore } from "../dal/workflow-runs/workflow-run-store.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";
import { pressWorkflow, WorkflowPressRefusedError } from "./workflow-press.js";

export interface RegisterWorkflowPressRoutesOptions {
  getWorkflowRunStore: () => WorkflowRunStore | null;
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

export function registerWorkflowPressRoutes(
  app: Hono<any>,
  options: RegisterWorkflowPressRoutesOptions
) {
  const { scopeResolver, moduleLoader, getWorkflowRunStore } = options;

  // A press dispatches a subject-bound RUN of the action's compiled flow: no
  // routine, no task. The run carries the subject in its run context and its
  // own `ai.workflow_run` audit row — see action-press.ts.
  app.post(
    `${AI_BASE_PATH}/v1/workflows/by-source/:workflowId/run`,
    async (c) => {
      const resolved = await resolveScope(c, scopeResolver);
      if (!resolved.ok) {
        return resolved.response;
      }
      const workflowId = c.req.param("workflowId");
      try {
        const body = (await c.req.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const { contextId, contextType } = readContext(body);
        const action = await resolveWorkflowById(workflowId, moduleLoader);
        if (!action) {
          return c.json({ error: "action_not_found" }, 404);
        }
        const input = (body.input ?? {}) as Record<string, unknown>;
        // Validated against the stored JSON Schema — the same check dispatch
        // runs; the FlowInput errors below turn it into a 400/422.
        assertFlowInput(action.definition.inputSchema, input);

        // The Space claim rides the same header the chat lane uses, with the
        // body as fallback for API callers that cannot set headers.
        const spaceClaim =
          c.req.header("x-engenty-space-id")?.trim() ||
          (typeof body.space_id === "string" ? body.space_id.trim() : "") ||
          null;
        const pressed = await pressWorkflow({
          action,
          context: { contextId, contextType },
          input,
          mastra,
          scope: resolved.scope,
          spaceId: spaceClaim,
        });
        return c.json({
          deduped: pressed.deduped,
          request_id: pressed.requestId,
          run_id: pressed.runId,
          thread_id: pressed.threadId,
        });
      } catch (err) {
        if (err instanceof FlowInputMissingError) {
          return c.json(
            { error: "workflow_input_invalid", missing: err.missing },
            400
          );
        }
        if (err instanceof FlowInputShapeError) {
          return c.json(
            { error: "workflow_input_invalid", issues: err.issues },
            422
          );
        }
        if (err instanceof WorkflowPressRefusedError) {
          return c.json({ error: err.code, reason: err.reason }, 409);
        }
        return handleRouteError(
          c,
          "failed to run action",
          "agent_actions.internalError",
          err
        );
      }
    }
  );

  /**
   * The tenant flow a module workflow reconciled into — WITHOUT running it.
   * Ensure-on-use is gone: this only reads; a missing row is a 409 telling
   * the caller the reconcile has not materialized the workflow yet.
   */
  app.post(
    `${AI_BASE_PATH}/v1/workflows/by-source/:workflowId/materialize`,
    async (c) => {
      const resolved = await resolveScope(c, scopeResolver);
      if (!resolved.ok) {
        return resolved.response;
      }
      const workflowId = c.req.param("workflowId");
      try {
        const action = await resolveWorkflowById(workflowId, moduleLoader);
        if (!action) {
          return c.json({ error: "action_not_found" }, 404);
        }
        const store = createWorkflowStoreFromEnv();
        if (!store) {
          return c.json({ error: "workflows.unconfigured" }, 503);
        }
        const existing = await store.findBySourceWorkflow({
          sourceWorkflowId: action.id,
          tenantId: resolved.scope.tenantId,
        });
        const current = existing
          ? await store.getCurrent({
              id: existing.id,
              tenantId: resolved.scope.tenantId,
            })
          : null;
        if (!current) {
          return c.json({ error: "action_flow_not_materialized" }, 409);
        }
        return c.json({
          workflow_id: current.graph.id,
          name: current.graph.name,
          outcome: "current",
          version: current.version.version,
        });
      } catch (err) {
        return handleRouteError(
          c,
          "failed to resolve the action's flow",
          "agent_actions.compileFailed",
          err
        );
      }
    }
  );

  app.get(
    `${AI_BASE_PATH}/v1/workflows/by-source/:workflowId/runs`,
    async (c) => {
      const resolved = await resolveScope(c, scopeResolver);
      if (!resolved.ok) {
        return resolved.response;
      }
      const workflowId = c.req.param("workflowId");
      try {
        const store = getWorkflowRunStore();
        if (!store) {
          return c.json({ requests: [] });
        }
        const contextType = c.req.query("context_type") || null;
        const contextId = c.req.query("context_id") || null;
        const rows = await store.list({
          workflowId,
          contextId,
          contextType,
          tenantId: resolved.scope.tenantId,
        });
        return c.json({ requests: rows });
      } catch (err) {
        return handleRouteError(
          c,
          "failed to list action requests",
          "agent_actions.internalError",
          err
        );
      }
    }
  );
}
