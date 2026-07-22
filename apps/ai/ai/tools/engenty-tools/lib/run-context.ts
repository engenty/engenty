import { AsyncLocalStorage } from "node:async_hooks";
import type { ToolExecutionContext } from "@mastra/core/tools";
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
  coreBaseUrl?: string;
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
  }) => void;
  orchestratorThreadId?: string | null;
  runId?: string | null;
  tenantId?: string | null;
  userAccessToken?: string;
  userId?: string | null;
}

export const engentyToolsRunAls =
  new AsyncLocalStorage<EngentyToolsRunContext>();

export function getEngentyToolsRunContext() {
  return engentyToolsRunAls.getStore() ?? {};
}

export function resolveEngentyToolsRunContext(
  executionContext?: ToolExecutionContext
): EngentyToolsRunContext {
  const context = { ...getEngentyToolsRunContext() };
  if (!context.userAccessToken) {
    const token = getRequestContextToken(executionContext);
    if (token) {
      context.userAccessToken = token;
    }
  }
  return context;
}

function getRequestContextToken(executionContext?: ToolExecutionContext) {
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
