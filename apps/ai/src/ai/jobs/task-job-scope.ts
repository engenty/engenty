// Headless service-scope resolution for the Task Job substrate. A dispatched
// task run has no incoming HTTP request, so it acts as the AI service principal:
// the `ENGENTY_AI_SERVICE_JWT` is resolved to its workspace context (tenant +
// user) exactly once and reused as the run's `AiSessionScope`. The service
// identity is single-tenant — a message for a different tenant is a
// misconfiguration and fails loudly rather than acting cross-tenant.
import { createCoreAiScopeResolver } from "../../api/http.js";
import type { AiSessionScope } from "../sessions/types.js";

export function getTaskDispatchServiceJwt(): string {
  const jwt = process.env.ENGENTY_AI_SERVICE_JWT?.trim();
  if (!jwt) {
    throw new Error(
      "task-job: ENGENTY_AI_SERVICE_JWT is required to run dispatched task jobs"
    );
  }
  return jwt;
}

/**
 * Resolve the service scope for a dispatched task and assert it matches the
 * message's tenant. Returns an `AiSessionScope` whose `userAccessToken` is the
 * service JWT — the credential every module operation + tool call rides on.
 */
export async function resolveTaskJobServiceScope(
  tenantId: string
): Promise<AiSessionScope> {
  const serviceJwt = getTaskDispatchServiceJwt();
  const resolved = await createCoreAiScopeResolver()({
    authorization: `Bearer ${serviceJwt}`,
  });
  if (!resolved.ok) {
    throw new Error(
      `task-job: failed to resolve service scope from ENGENTY_AI_SERVICE_JWT — ${resolved.error}`
    );
  }
  if (resolved.scope.tenantId !== tenantId) {
    throw new Error(
      `task-job: dispatched tenant ${tenantId} does not match the service principal tenant ${resolved.scope.tenantId}`
    );
  }
  return { ...resolved.scope, userAccessToken: serviceJwt };
}
