import { AsyncLocalStorage } from "node:async_hooks";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { getEngentyCoreBaseUrlFromEnv } from "../../../../src/ai/core-http-client.js";
// The gate owns the SHAPE as well as the rule: one type means a new dimension
// of the surface cannot be added to the carrier and forgotten in the check.
import {
  isGlobalConnectorGate,
  isUnresolvedSpaceGate,
  type SpaceGateContext,
} from "./space-gate.js";
import type { ToolRiskLevel } from "./tool-approval.js";

/**
 * How the execute tool handles an operation that requires approval:
 * - `"suspend"` — suspend the Mastra run (native HITL): the chat shows the
 *   Approve/Deny card, the run parks, and the resume continues it in place.
 *   Interactive conversation runs use this.
 * - `"deny"` — return a clear denial result without prompting. Delegated child
 *   runs and headless task jobs are leaf runs with no interactive channel
 *   (their contract: no HITL suspend) — prompting would deadlock them.
 * - `"artifact"` — return the decision artifact as the tool result. Only the
 *   realtime-voice path uses this: it executes tools outside a Mastra run (no
 *   suspend available) and drives its own approve flow over the artifact.
 * Default when absent: `"deny"` (fail-safe for unknown headless contexts).
 *
 * `"defer"` (headless task jobs): skip the AI-side pre-gate and let core — the
 * authoritative policy engine — decide. Core's 202 `approval_required` comes
 * back as a structured `approval_pending` tool result (a durable approval
 * request may have been recorded, e.g. by the connections module), so the
 * agent can report the block instead of silently failing.
 *
 * `"request"` (durable task runs with a needs-input channel): RUN the pre-gate
 * against the durable task/routine grant set (so a pre-approved op passes). On
 * a gated miss, notify the run via `onApprovalRequired` and return a clear
 * `approval_pending` result — the run ends gracefully and the workflow records
 * a needs-input notification + task comment; a human approves and the task is
 * re-dispatched (parked in-place resume is not available for headless runs).
 */
export type EngentyToolApprovalPolicy =
  | "suspend"
  | "deny"
  | "artifact"
  | "defer"
  | "request";

export interface EngentyToolsRunContext {
  accessToken?: string;
  // core.agents principal uuid of the acting agent. Forwarded to core as
  // x-engenty-agent-id so operation policies (e.g. the secrets reveal gate)
  // see an agent principal instead of impersonating the user.
  agentId?: string | null;
  // Human-readable agent type key (e.g. "engenty.copilot", "contacts.manager")
  // of the acting agent — audit attribution for writes the agent authors
  // (memory records stamp it as agent_type_key). Distinct from `agentId`,
  // which is the core.agents uuid used for authorization.
  agentTypeKey?: string | null;
  // Operation ids the user approved for this chat (Phase 3.2c). The execute tool
  // consults these to skip re-prompting an already-approved gated operation.
  approvalGrants?: readonly string[];
  approvalPolicy?: EngentyToolApprovalPolicy;
  /**
   * This run can PARK on a Mastra suspend and be resumed by a human answer, so
   * interaction tools (`requestDecision`) may suspend instead of returning an
   * artifact. Set only by the interactive conversation executor and its resume.
   *
   * Absent — headless task jobs, delegated child runs, realtime voice — means
   * nobody can answer a suspend, and suspending would hang the run forever.
   * Distinct from `approvalPolicy`, which decides how a GATED OPERATION is
   * cleared; this is about whether the run has a human channel at all.
   */
  canSuspendForInteraction?: boolean;
  coreBaseUrl?: string;
  /**
   * Exactly-once for identical writes (invocation-dedupe.ts): canonical
   * invocation key → the first successful result. The execute tool registers
   * every successful non-read-only invoke here and refuses an identical
   * repeat with that result attached. A MUTABLE map created per run by the
   * lane that owns the run (delegate-run seeds one for headless task jobs and
   * delegated children — including the approved-call replay, which is what
   * catches a model re-issuing a call that was already replayed). Lanes that
   * do not seed it keep the old behavior.
   */
  executedWriteCalls?: Map<string, unknown>;
  fetchImpl?: typeof fetch;
  // Goal the agent is pursuing — the conversation thread id for chat runs.
  // Forwarded as x-engenty-goal-id; approval grants persist against it.
  goalId?: string | null;
  // `"request"` policy: invoked when a gated operation is missing from the
  // grant set, so the run can record a durable needs-input request. The run
  // then returns an `approval_pending` result and ends gracefully.
  onApprovalRequired?: (info: {
    operationId: string;
    riskLevel: ToolRiskLevel;
    title?: string;
    /**
     * The gated call's arguments, when the request names ONE concrete call
     * (single-operation module ops). Recorded so an approval can replay that
     * exact call once on resume instead of the model re-deriving it. Bulk
     * pre-approvals and workspace-tool suspensions carry no input.
     */
    input?: Record<string, unknown>;
  }) => void;
  orchestratorThreadId?: string | null;
  // Calls a person allowed on a wizard's approval step, and how to record
  // that answer on core's own approval request when core gates the call too:
  // the run's service credential may not decide it, the person may.
  personApproval?: {
    decide: (approvalRequestId: string) => Promise<void>;
    operationIds: readonly string[];
  };
  /**
   * Re-mint this run's bearer after core answers 401 — the retry-once seam
   * for headless runs whose 15-minute service token expires mid-run (a task
   * run that outlives its token would otherwise lose every core-backed tool
   * for its remaining life). The callback returns the fresh token AND writes
   * it back into this context, so later tool calls start on it. Stamped only
   * where a mint path exists (service-credential scopes); an interactive
   * user token has none, and its 401 must surface unchanged.
   */
  refreshAccessToken?: () => Promise<string | null>;
  // The routine whose fire started this run. Forwarded as
  // x-engenty-routine-id so routine-scoped grants open the gate too.
  routineId?: string | null;
  runId?: string | null;
  /**
   * The space this run is happening in (PLAN-spaces.md Phase C3a —
   * `resolveRunSpace`).
   *
   * - a resolved `SpaceGateSurface` narrows module/connector tools to the
   *   mounted surface
   * - `{ kind: "unresolved", ... }` is a claimed Space that could not be
   *   loaded — module/connector/delegation/`/data` work must refuse with
   *   `space_context_unresolved`; platform tools and chat stay usable
   * - absent/null is intentional tenant-global (no Space claimed)
   *
   * Unresolved must never be stored as absence: that is the widening this
   * field exists to prevent.
   */
  space?: SpaceGateContext | null;
  // Task a headless run is executing. Forwarded as x-engenty-task-id so
  // core's approval gate can spend task-scoped grants ("this task may do X",
  // approved before the retry's principal existed) and stamp the task on any
  // request it files — the link that lets an approval resume the task.
  taskId?: string | null;
  tenantId?: string | null;
  // The thread the human is actually watching. Root runs set it to their own
  // thread; a delegated child run inherits it (delegate-run overrides
  // orchestratorThreadId with the CHILD thread, so anything the user must see —
  // e.g. a published artifact — must target this instead).
  userFacingThreadId?: string | null;
  userId?: string | null;
}

export const engentyToolsRunAls =
  new AsyncLocalStorage<EngentyToolsRunContext>();

export function getEngentyToolsRunContext() {
  return engentyToolsRunAls.getStore() ?? {};
}

/**
 * Make an agent this run itself just mounted visible to the run's own gates.
 *
 * The space surface is resolved once at run start and every gate in the run
 * (the routines mount gate, delegation targets) reads the same object. A live
 * hire mounts its agent mid-run; without this the very turn that created a
 * specialist refuses to bind a routine to it or delegate to it. Widens only
 * the in-memory surface of the current run — core stays authoritative, and
 * the next run re-resolves from the (invalidated) surface cache.
 */
export function addMountedAgentToRunSpace(
  space: SpaceGateContext | null | undefined,
  agentId: string
): void {
  if (!space || isUnresolvedSpaceGate(space) || isGlobalConnectorGate(space)) {
    return;
  }
  if (space.agentIds instanceof Set) {
    (space.agentIds as Set<string>).add(agentId);
    return;
  }
  // Older/manual carriers may not have set the field; give them one.
  (space as { agentIds?: ReadonlySet<string> }).agentIds = new Set([
    ...(space.agentIds ?? []),
    agentId,
  ]);
}

/**
 * The other direction: an agent this run just deleted must stop being a
 * delegation or routine target for the rest of the turn. Narrows only the
 * in-memory surface of the current run, like the add above.
 */
export function removeMountedAgentFromRunSpace(
  space: SpaceGateContext | null | undefined,
  agentId: string
): void {
  if (!space || isUnresolvedSpaceGate(space) || isGlobalConnectorGate(space)) {
    return;
  }
  if (space.agentIds instanceof Set) {
    (space.agentIds as Set<string>).delete(agentId);
  }
}

/** Fill `coreBaseUrl` from env when a run forgot to stamp it (chat ALS). */
export function withEnvCoreBaseUrl(
  ctx: EngentyToolsRunContext
): EngentyToolsRunContext {
  if (ctx.coreBaseUrl?.trim()) {
    return ctx;
  }
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  return coreBaseUrl ? { ...ctx, coreBaseUrl } : ctx;
}

/**
 * The only fields these helpers read off a tool-execution context are
 * `requestContext` and the `agent` HITL seam. Typing the parameter that way accepts every shape Mastra
 * hands us — the bare `ToolExecutionContext`, the 1.55 `ToolExecuteContext`
 * wrapper with its extra generics, and hand-built test contexts — without
 * pinning a generic instantiation that changes between Mastra releases.
 */
export interface ToolRequestContextCarrier<TSuspendPayload = never> {
  /**
   * Native HITL seam: `agent.suspend` parks the run, `agent.resumeData`
   * carries the decision back. Generic in the payload because function
   * parameters are contravariant — a tool that declares a `suspendSchema`
   * gets a `suspend` narrowed to that payload, and a wider `Record` here
   * would refuse it. Callers that never suspend keep the `never` default.
   */
  agent?: {
    resumeData?: unknown;
    suspend?: (payload: TSuspendPayload) => Promise<unknown>;
  };
  requestContext?: ToolExecutionContext["requestContext"];
}

export function resolveEngentyToolsRunContext(
  executionContext?: ToolRequestContextCarrier
): EngentyToolsRunContext {
  const context = { ...getEngentyToolsRunContext() };
  if (!context.accessToken) {
    const token = getRequestContextToken(executionContext);
    if (token) {
      context.accessToken = token;
    }
  }
  return context;
}

function getRequestContextToken(executionContext?: ToolRequestContextCarrier) {
  const requestContext = executionContext?.requestContext;
  if (!requestContext) {
    return;
  }
  const raw =
    getContextValue(requestContext, "mastra__authToken") ??
    getContextValue(requestContext, "authorization") ??
    getContextValue(requestContext, "Authorization");
  return normalizeBearerToken(raw);
}

function getContextValue(
  requestContext: NonNullable<ToolExecutionContext["requestContext"]>,
  key: string
) {
  try {
    return requestContext.get<string>(key);
  } catch {
    return;
  }
}

function normalizeBearerToken(value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  let normalized = value.trim();
  while (/^Bearer\s+/i.test(normalized)) {
    normalized = normalized.replace(/^Bearer\s+/i, "").trim();
  }
  if (!normalized) {
    return;
  }
  return normalized;
}
