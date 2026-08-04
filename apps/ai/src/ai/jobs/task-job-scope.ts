// Headless service-scope resolution for the Task Job substrate. A dispatched
// task run has no incoming HTTP request, so it acts as the AI service
// principal: a fresh service access token (see ../service-credential.ts) is
// resolved to its workspace context (tenant + user) per dispatch and reused as
// the run's `AiSessionScope`. The token is minted FOR THE MESSAGE'S TENANT —
// a platform-scoped credential serves every tenant with per-tenant tokens; a
// tenant-bound one refuses foreign tenants at the exchange. The tenant
// assertion below stays as the belt: whatever token came back, a mismatch is
// a misconfiguration and fails loudly rather than acting cross-tenant.
import { createCoreAiScopeResolver } from "../../api/http.js";
import { getServiceAccessToken } from "../service-credential.js";
import type { AiSessionScope } from "../sessions/types.js";

export async function getTaskDispatchServiceJwt(
  tenantId?: string
): Promise<string> {
  const jwt = await getServiceAccessToken(tenantId ? { tenantId } : undefined);
  if (!jwt) {
    throw new Error(
      "task-job: a service credential (ENGENTY_AI_SERVICE_SECRET) is required to run dispatched task jobs"
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
  const serviceJwt = await getTaskDispatchServiceJwt(tenantId);
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
  };
}
