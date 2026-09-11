// Graph-action run context — the ONLY channel by which a graph run learns who
// it is running as.
//
// Security invariant (PLAN-workflow-designer.md §6): the stored graph JSON is
// untrusted, tenant-authored data. It never carries a tenant id, a user id, or
// a credential — those come exclusively from the request context the dispatcher
// sets when it starts the run. A graph node therefore cannot name a tenant it
// isn't running in, and a graph copied between tenants is inert.
//
// Mastra passes `requestContext` into declarative `tool` entries (verified in
// core 1.57 `runToolEntry`), which is what makes this channel usable at all.
import type { RequestContext } from "@mastra/core/request-context";
import type { SpaceGateContext } from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import { resolveTaskJobServiceScope } from "../jobs/task-job-scope.js";
import { type AiSessionScope, scopeAccessToken } from "../sessions/types.js";
import { deserializeGraphSpace } from "./graph-space.js";
import { GRAPH_RUN_CONTEXT } from "./run-context-keys.js";

export { GRAPH_RUN_CONTEXT } from "./run-context-keys.js";

/** What a specialist node may do when it reaches a gated operation. */
export type GraphApprovalPolicy = "deny" | "defer" | "request";

export interface GraphRunContext {
  /** Action-level allow list, or undefined when the action doesn't narrow. */
  allowedToolIds?: readonly string[];
  /**
   * What this run may do without asking — the routine's standing grants.
   * Spent by the module-operation pre-gate and by the workspace tools' gate,
   * which read the same list off the run's tools context.
   */
  approvalGrants?: readonly string[];
  /**
   * Absent/"deny" = the pre-2026-08-24 rule: a specialist node cannot perform
   * gated operations and approval is an explicit gate node. "request" lets the
   * node ask mid-run (it suspends, a human decides, the call replays once);
   * "defer" lets core decide per operation risk.
   */
  approvalPolicy?: GraphApprovalPolicy;
  /**
   * The thread this run was asked for in. A step may READ it (see
   * `createCallerThreadTools`); nothing writes to it. Absent on a schedule.
   */
  callerThreadId?: string;
  contextId?: string;
  contextType?: string;
  /**
   * The specialist whose chat this run reports into — a routine's agent, or
   * the action's owner agent. Absent for an action nobody owns, which then has
   * no chat to render into.
   */
  deskAgentId?: string;
  requestId: string;
  /**
   * The routine this fire belongs to. Absent for a press or an agent call —
   * those belong to a subject, not to a recurring job.
   */
  routineId?: string;
  /**
   * The Space this graph run happens in. `null` is intentional tenant-global.
   * Absent on a context that has not been resolved yet — primitives then
   * inherit ALS rather than assuming global.
   */
  space?: SpaceGateContext | null;
  /**
   * The Task this run works on, when the run has one as its SUBJECT — a work
   * item somebody assigned to a specialist. A specialist node mounts the
   * task's comment/ask tools from it, so the run can report and ask against
   * the item it was opened for. Absent for a routine fire or a press.
   */
  taskId?: string;
  tenantId: string;
  /** The action's thread. Only `thread_mode: "reuse"` nodes run on it. */
  threadId: string;
  /** The human who triggered the run, when there is one (null for system). */
  userId?: string;
  workflowId: string;
  workflowVersion: number;
}

/** Only the three known policies pass; anything else fails closed to deny. */
function readApprovalPolicy(
  requestContext: RequestContext
): GraphApprovalPolicy | undefined {
  const value = readString(requestContext, GRAPH_RUN_CONTEXT.approvalPolicy);
  return value === "request" || value === "defer" || value === "deny"
    ? value
    : undefined;
}

function readString(
  requestContext: RequestContext,
  key: string
): string | undefined {
  const value = requestContext.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Read + validate the run context. Throws rather than defaulting: a primitive
 * that can't prove which tenant it belongs to must not run at all.
 */
export function readGraphRunContext(
  requestContext: RequestContext | undefined
): GraphRunContext {
  if (!requestContext) {
    throw new Error(
      "graph-action: no request context on this run — primitives cannot resolve a tenant"
    );
  }
  const tenantId = readString(requestContext, GRAPH_RUN_CONTEXT.tenantId);
  if (!tenantId) {
    throw new Error(
      "graph-action: request context carries no tenant — refusing to execute"
    );
  }
  const requestId = readString(requestContext, GRAPH_RUN_CONTEXT.requestId);
  if (!requestId) {
    throw new Error(
      "graph-action: request context carries no action request id"
    );
  }
  const threadId = readString(requestContext, GRAPH_RUN_CONTEXT.threadId);
  if (!threadId) {
    throw new Error("graph-action: request context carries no thread id");
  }
  const workflowId = readString(requestContext, GRAPH_RUN_CONTEXT.workflowId);
  const rawVersion = requestContext.get(GRAPH_RUN_CONTEXT.workflowVersion);
  const workflowVersion =
    typeof rawVersion === "number" ? rawVersion : Number(rawVersion);
  if (!(workflowId && Number.isInteger(workflowVersion))) {
    throw new Error(
      "graph-action: request context carries no pinned action graph version"
    );
  }
  const rawAllowed = requestContext.get(GRAPH_RUN_CONTEXT.allowedToolIds);
  const allowedToolIds = Array.isArray(rawAllowed)
    ? rawAllowed.filter((id): id is string => typeof id === "string")
    : undefined;
  const rawGrants = requestContext.get(GRAPH_RUN_CONTEXT.approvalGrants);
  const approvalGrants = Array.isArray(rawGrants)
    ? rawGrants.filter((id): id is string => typeof id === "string")
    : undefined;
  const space = deserializeGraphSpace(
    requestContext.get(GRAPH_RUN_CONTEXT.space)
  );

  return {
    workflowId,
    workflowVersion,
    requestId,
    tenantId,
    threadId,
    ...(allowedToolIds ? { allowedToolIds } : {}),
    ...(approvalGrants?.length ? { approvalGrants } : {}),
    ...(space === undefined ? {} : { space }),
    ...(readString(requestContext, GRAPH_RUN_CONTEXT.contextType)
      ? {
          contextType: readString(
            requestContext,
            GRAPH_RUN_CONTEXT.contextType
          ),
        }
      : {}),
    ...(readString(requestContext, GRAPH_RUN_CONTEXT.contextId)
      ? { contextId: readString(requestContext, GRAPH_RUN_CONTEXT.contextId) }
      : {}),
    ...(readString(requestContext, GRAPH_RUN_CONTEXT.callerThreadId)
      ? {
          callerThreadId: readString(
            requestContext,
            GRAPH_RUN_CONTEXT.callerThreadId
          ),
        }
      : {}),
    ...(readString(requestContext, GRAPH_RUN_CONTEXT.deskAgentId)
      ? {
          deskAgentId: readString(
            requestContext,
            GRAPH_RUN_CONTEXT.deskAgentId
          ),
        }
      : {}),
    ...(readString(requestContext, GRAPH_RUN_CONTEXT.taskId)
      ? { taskId: readString(requestContext, GRAPH_RUN_CONTEXT.taskId) }
      : {}),
    ...(readString(requestContext, GRAPH_RUN_CONTEXT.routineId)
      ? { routineId: readString(requestContext, GRAPH_RUN_CONTEXT.routineId) }
      : {}),
    ...(readApprovalPolicy(requestContext)
      ? { approvalPolicy: readApprovalPolicy(requestContext) }
      : {}),
    ...(readString(requestContext, GRAPH_RUN_CONTEXT.userId)
      ? { userId: readString(requestContext, GRAPH_RUN_CONTEXT.userId) }
      : {}),
  };
}

// A graph run makes many primitive calls; each would otherwise mint its own
// service token. Cache per (tenant, request) — keyed by request id so two
// concurrent runs in the same tenant can't share a resolution across a
// credential rotation boundary. NOT for the run's whole life, though: service
// tokens live 15 minutes and a single research step can run longer, so an
// entry whose token is near expiry re-resolves and the next step starts on a
// live bearer. Expiry INSIDE a step is the core client's refresh seam
// (`refreshAccessToken`), not this cache's job.
interface CachedGraphRunScope {
  /** Token exp, filled once resolved; null = unresolved or no readable exp. */
  expiresAtMs: number | null;
  promise: Promise<AiSessionScope>;
}
const scopeCache = new Map<string, CachedGraphRunScope>();
const SCOPE_TOKEN_REFRESH_MARGIN_MS = 120_000;

/** The token's `exp`, read without verification — this side only schedules
 * renewal; core stays the verifier. */
function jwtExpiresAtMs(token: string | undefined): number | null {
  const payloadPart = token?.split(".")[1];
  if (!payloadPart) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8")
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the service scope this graph run acts as. Same principal a
 * single-agent action run uses today — graph actions are not a privilege
 * escalation path, they're the same headless service principal.
 */
export function resolveGraphRunScope(
  ctx: GraphRunContext
): Promise<AiSessionScope> {
  const key = `${ctx.tenantId}:${ctx.requestId}`;
  const cached = scopeCache.get(key);
  if (
    cached &&
    (cached.expiresAtMs === null ||
      cached.expiresAtMs - Date.now() > SCOPE_TOKEN_REFRESH_MARGIN_MS)
  ) {
    return cached.promise;
  }
  const entry: CachedGraphRunScope = {
    expiresAtMs: null,
    promise: resolveTaskJobServiceScope(ctx.tenantId).then(
      (scope) => {
        entry.expiresAtMs = jwtExpiresAtMs(scopeAccessToken(scope));
        return scope;
      },
      (err: unknown) => {
        // Don't cache a failed resolution — a transient credential outage
        // would otherwise poison every later node in the run.
        if (scopeCache.get(key) === entry) {
          scopeCache.delete(key);
        }
        throw err;
      }
    ),
  };
  scopeCache.set(key, entry);
  return entry.promise;
}

/** Drop a finished run's cached scope (called by the dispatcher on settle). */
export function forgetGraphRunScope(ctx: {
  requestId: string;
  tenantId: string;
}): void {
  scopeCache.delete(`${ctx.tenantId}:${ctx.requestId}`);
}

/**
 * Intersect a node-level allow list with the action-level one. Narrowing only:
 * a node can restrict further than the action, never widen past it.
 */
export function intersectAllowedToolIds(
  actionLevel: readonly string[] | undefined,
  nodeLevel: readonly string[] | undefined
): string[] | undefined {
  if (!(actionLevel || nodeLevel)) {
    return;
  }
  if (!actionLevel) {
    return [...(nodeLevel ?? [])];
  }
  if (!nodeLevel) {
    return [...actionLevel];
  }
  const allowed = new Set(actionLevel);
  return nodeLevel.filter((id) => allowed.has(id));
}
