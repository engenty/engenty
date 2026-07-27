// Headless service-scope resolution for the Task Job substrate. A dispatched
// task run has no incoming HTTP request, so it acts as the AI service
// principal: a fresh service access token (see ../service-credential.ts) is
// resolved to its workspace context (tenant + user) per dispatch and reused as
// the run's `AiSessionScope`. The service identity is single-tenant — a
// message for a different tenant is a misconfiguration and fails loudly
// rather than acting cross-tenant.
import { createCoreAiScopeResolver } from "../../api/http.js";
import { getServiceAccessToken } from "../service-credential.js";
import type { AiSessionScope } from "../sessions/types.js";

export async function getTaskDispatchServiceJwt(): Promise<string> {
  const jwt = await getServiceAccessToken();
  if (!jwt) {
    throw new Error(
      "task-job: a service credential (ENGENTY_AI_SERVICE_SECRET, ENGENTY_AI_SERVICE_EMAIL/PASSWORD, or ENGENTY_AI_SERVICE_JWT) is required to run dispatched task jobs"
    );
  }
  return jwt;
}

/**
 * Resolve the service scope for a dispatched task and assert it matches the
 * message's tenant. Returns an `AiSessionScope` whose credential is the
 * service token — the credential every module operation + tool call rides on.
 * Minted per dispatch, so a task run never starts on a token that is about to
 * expire mid-run.
 */
export async function resolveTaskJobServiceScope(
  tenantId: string
): Promise<AiSessionScope> {
  const serviceJwt = await getTaskDispatchServiceJwt();
  const resolved = await createCoreAiScopeResolver()({
    authorization: `Bearer ${serviceJwt}`,
  });
  if (!resolved.ok) {
    throw new Error(
      `task-job: failed to resolve service scope from the service credential — ${resolved.error}`
    );
  }
  if (resolved.scope.tenantId !== tenantId) {
    throw new Error(
      `task-job: dispatched tenant ${tenantId} does not match the service principal tenant ${resolved.scope.tenantId}`
    );
  }
  return {
    ...resolved.scope,
    credential: { kind: "service", token: serviceJwt },
    userAccessToken: serviceJwt,
  };
}
