import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import {
  describeEngentyTool,
  executeEngentyTool,
  getEngentyToolsContext,
  listEngentyToolModules,
  searchEngentyTools,
} from "../../ai/tools/engenty-tools/index.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../ai/tools/engenty-tools/lib/run-context.js";
import {
  TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS,
  TOOL_APPROVAL_CHOICE_APPROVE_ONCE,
  TOOL_APPROVAL_CHOICE_DENY,
} from "../../ai/tools/engenty-tools/lib/tool-approval.js";
import { applyApprovedFieldUpdates } from "../ai/jobs/apply-field-updates.js";
import { auditToolApprovalDecision } from "../ai/sessions/tool-approval-audit.js";
import {
  readToolApprovalGrants,
  withToolApprovalGrant,
  withToolApprovalGrantOnce,
} from "../ai/sessions/tool-approval-grants.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentSessionStore } from "../dal/agent-sessions/index.js";
import { createApiCatalogSearchStore } from "../dal/api-catalog/api-catalog-search-store.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

const realtimeToolExecuteBodySchema = z.object({
  arguments: z.unknown().optional(),
  call_id: z.string().trim().min(1).max(256).optional(),
  name: z.string().trim().min(1).max(128),
  thread_id: z.string().uuid().optional(),
});

const realtimeFieldsApplyBodySchema = z.object({
  approved: z
    .array(
      z.object({
        field: z.string().trim().min(1).max(128),
        value: z.union([z.string(), z.null()]),
      })
    )
    .min(1),
  context_id: z.string().trim().min(1).max(256),
  context_type: z.string().trim().min(1).max(128),
});

const realtimeToolApproveBodySchema = z.object({
  decision: z.enum([
    TOOL_APPROVAL_CHOICE_APPROVE_ONCE,
    TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS,
    TOOL_APPROVAL_CHOICE_DENY,
  ]),
  operation_id: z.string().trim().min(1).max(256),
  thread_id: z.string().uuid(),
});

export interface RegisterRealtimeToolRoutesOptions {
  coreBaseUrl?: string;
  coreFetch?: typeof fetch;
  getSessionStore?: () => AgentSessionStore | null;
  scopeResolver: AiScopeResolver;
}

export function registerRealtimeToolRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: RegisterRealtimeToolRoutesOptions
): void {
  app.post(`${AI_BASE_PATH}/v1/realtime/tools/execute`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = realtimeToolExecuteBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!body.success) {
      return c.json({ error: "realtime_tools.invalidBody" }, 400);
    }

    // Read any chat-scoped approval grants for this thread so a previously
    // approved gated op (or one just approved on the resolve path) runs without
    // re-prompting. Mirrors the text copilot's execute-boundary gate.
    const approvalGrants = await loadThreadApprovalGrants({
      getSessionStore: opts.getSessionStore,
      tenantId: scope.scope.tenantId,
      threadId: body.data.thread_id,
    });

    try {
      const current = getEngentyToolsRunContext();
      const result = await engentyToolsRunAls.run(
        {
          ...current,
          approvalGrants,
          ...(opts.coreBaseUrl ? { coreBaseUrl: opts.coreBaseUrl } : {}),
          ...(opts.coreFetch ? { fetchImpl: opts.coreFetch } : {}),
          orchestratorThreadId: body.data.thread_id ?? null,
          tenantId: scope.scope.tenantId,
          userAccessToken: scope.scope.userAccessToken,
          userId: scope.scope.userId,
        },
        () =>
          executeRealtimeEngentyTool({
            arguments: body.data.arguments,
            name: body.data.name,
          })
      );
      return c.json({ result });
    } catch (err) {
      return handleRouteError(
        c,
        "realtime tool execution failed",
        "realtime_tools.executionFailed",
        err
      );
    }
  });

  // Persist a voice user's approval decision for a gated backend op, so the
  // follow-up `execute` call passes the gate. "once" survives the immediate
  // re-invoke; "always" persists a thread grant for the whole chat.
  app.post(`${AI_BASE_PATH}/v1/realtime/tools/approve`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = realtimeToolApproveBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!body.success) {
      return c.json({ error: "realtime_tools.invalidBody" }, 400);
    }
    const store = opts.getSessionStore?.();
    if (!store) {
      return c.json({ error: "realtime_tools.sessionStoreUnavailable" }, 503);
    }

    const decision = body.data.decision;
    const operationId = body.data.operation_id;
    auditToolApprovalDecision({
      decision,
      operationId,
      tenantId: scope.scope.tenantId,
      threadId: body.data.thread_id,
      userId: scope.scope.userId,
    });

    if (decision === TOOL_APPROVAL_CHOICE_DENY) {
      return c.json({ granted: false, ok: true });
    }

    try {
      const session = await store.getSession({
        tenantId: scope.scope.tenantId,
        threadId: body.data.thread_id,
      });
      const nextMetadata =
        decision === TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS
          ? withToolApprovalGrant(session?.metadata, operationId)
          : withToolApprovalGrantOnce(session?.metadata, operationId);
      await store.updateSessionForUser({
        metadata: nextMetadata,
        tenantId: scope.scope.tenantId,
        threadId: body.data.thread_id,
        userId: scope.scope.userId,
      });
      return c.json({ granted: true, ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "realtime tool approval failed",
        "realtime_tools.approvalFailed",
        err
      );
    }
  });

  // Apply user-approved field suggestions to a subject, generically by
  // context_type — the same write the action-job workflow performs, but driven
  // by the voice client (which has no suspended workflow run to resume).
  app.post(`${AI_BASE_PATH}/v1/realtime/fields/apply`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = realtimeFieldsApplyBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!body.success) {
      return c.json({ error: "realtime_tools.invalidBody" }, 400);
    }
    const patch: Record<string, unknown> = {};
    for (const entry of body.data.approved) {
      patch[entry.field] = entry.value;
    }
    try {
      const result = await applyApprovedFieldUpdates({
        contextId: body.data.context_id,
        contextType: body.data.context_type,
        patch,
        scope: scope.scope,
      });
      return c.json({ applied: result.applied, ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "realtime field apply failed",
        "realtime_tools.applyFailed",
        err
      );
    }
  });
}

async function loadThreadApprovalGrants(params: {
  getSessionStore?: () => AgentSessionStore | null;
  tenantId: string;
  threadId?: string;
}): Promise<readonly string[]> {
  if (!params.threadId) {
    return [];
  }
  const store = params.getSessionStore?.();
  if (!store) {
    return [];
  }
  try {
    const session = await store.getSession({
      tenantId: params.tenantId,
      threadId: params.threadId,
    });
    return readToolApprovalGrants(session?.metadata);
  } catch (err) {
    console.error("realtime approval grants load failed", err);
    return [];
  }
}

async function executeRealtimeEngentyTool(input: {
  arguments: unknown;
  name: string;
}) {
  const args =
    input.arguments && typeof input.arguments === "object"
      ? (input.arguments as Record<string, unknown>)
      : {};
  switch (input.name) {
    case "engenty_tools_context":
      return getEngentyToolsContext(undefined);
    case "engenty_tools_modules":
      return listEngentyToolModules(undefined);
    case "engenty_tools_search":
      return searchEngentyTools(args, {
        apiCatalog: createApiCatalogSearchStore(),
      });
    case "engenty_tool_describe":
      return describeEngentyTool(args, undefined);
    case "engenty_tool_execute":
      return executeEngentyTool(args, undefined);
    default:
      return {
        ok: false,
        code: "unknown_realtime_tool",
        message: `Realtime tool '${input.name}' is not registered.`,
      };
  }
}
