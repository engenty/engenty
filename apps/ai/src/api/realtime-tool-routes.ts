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
import { resolveCoreAgentId } from "../ai/agent-identity.js";
import { applyApprovedFieldUpdates } from "../ai/jobs/apply-field-updates.js";
import { persistSecretsGoalGrant } from "../ai/secrets-goal-grant.js";
import { auditToolApprovalDecision } from "../ai/sessions/tool-approval-audit.js";
import {
  readToolApprovalGrants,
  withToolApprovalGrant,
  withToolApprovalGrantOnce,
} from "../ai/sessions/tool-approval-grants.js";
import { scopeAccessToken } from "../ai/sessions/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentSessionStore } from "../dal/agent-sessions/index.js";
import { createApiCatalogSearchStore } from "../dal/api-catalog/api-catalog-search-store.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

// Voice sessions always drive the built-in copilot; there is no per-session
// agent selection on the realtime path.
const REALTIME_AGENT_KEY = "engenty.copilot";

const realtimeToolExecuteBodySchema = z.object({
  // One-shot approval for THIS call only: the voice user approved the gated
  // operation in the on-screen dialog, but the session has no thread yet to
  // persist the grant against. Carries the same authority as the persisted
  // grant path — an explicit user decision on the user's own bearer token.
  approval_grant_once: z.string().trim().min(1).max(256).optional(),
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
    // re-prompting. Mirrors the text copilot's execute-boundary gate. A
    // threadless voice session instead carries the dialog decision as a
    // one-shot grant on the call itself.
    const approvalGrants = await loadThreadApprovalGrants({
      getSessionStore: opts.getSessionStore,
      tenantId: scope.scope.tenantId,
      threadId: body.data.thread_id,
    });
    const effectiveGrants = body.data.approval_grant_once
      ? [...approvalGrants, body.data.approval_grant_once]
      : approvalGrants;

    // Voice parity with the chat approve hook: an approved secrets_reveal also
    // persists the durable goal-scoped grant BEFORE execution, or core would
    // re-gate the agent-forwarded invoke forever (voice has no suspend/resume).
    if (
      body.data.name === "engenty_tool_execute" &&
      body.data.thread_id &&
      effectiveGrants.includes("secrets_reveal")
    ) {
      const args = body.data.arguments as
        | { id?: unknown; input?: { secret_id?: unknown } }
        | undefined;
      if (
        args?.id === "secrets_reveal" &&
        typeof args.input?.secret_id === "string"
      ) {
        await persistSecretsGoalGrant({
          coreBaseUrl: opts.coreBaseUrl,
          goalId: body.data.thread_id,
          secretId: args.input.secret_id,
          accessToken: scopeAccessToken(scope.scope),
        });
      }
    }

    try {
      const current = getEngentyToolsRunContext();
      // Voice is the copilot on another channel — forward the same agent
      // identity so agent-gated operations (e.g. secret reveals) don't have a
      // voice-shaped bypass. Goal = the voice thread, when one exists.
      const coreAgentId = await resolveCoreAgentId(
        scope.scope.tenantId,
        REALTIME_AGENT_KEY
      );
      const result = await engentyToolsRunAls.run(
        {
          ...current,
          ...(coreAgentId ? { agentId: coreAgentId } : {}),
          approvalGrants: effectiveGrants,
          // Voice executes tools outside a Mastra run (nothing to suspend); it
          // receives the decision artifact and drives its own approve flow.
          approvalPolicy: "artifact",
          ...(opts.coreBaseUrl ? { coreBaseUrl: opts.coreBaseUrl } : {}),
          ...(opts.coreFetch ? { fetchImpl: opts.coreFetch } : {}),
          goalId: body.data.thread_id ?? null,
          orchestratorThreadId: body.data.thread_id ?? null,
          tenantId: scope.scope.tenantId,
          accessToken: scopeAccessToken(scope.scope),
          userFacingThreadId: body.data.thread_id ?? null,
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
