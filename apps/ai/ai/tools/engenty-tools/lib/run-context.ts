import { AsyncLocalStorage } from "node:async_hooks";
import type { ToolExecutionContext } from "@mastra/core/tools";

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
 */
export type EngentyToolApprovalPolicy = "suspend" | "deny" | "artifact";

export interface EngentyToolsRunContext {
  // Operation ids the user approved for this chat (Phase 3.2c). The execute tool
  // consults these to skip re-prompting an already-approved gated operation.
  approvalGrants?: readonly string[];
  approvalPolicy?: EngentyToolApprovalPolicy;
  coreBaseUrl?: string;
  fetchImpl?: typeof fetch;
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
