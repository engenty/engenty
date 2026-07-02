// Headless module-operation invoker for the trigger scheduler. Scheduled fires
// have no incoming HTTP request, so they act as the AI service principal
// (ENGENTY_AI_SERVICE_JWT) — the same identity the task-job substrate uses.
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { createCoreAiScopeResolver } from "../api/http.js";

export type SchedulerOperationInvoker = (
  operationId: string,
  input?: Record<string, unknown>
) => Promise<unknown>;

export function getSchedulerServiceJwt(): string | null {
  return process.env.ENGENTY_AI_SERVICE_JWT?.trim() || null;
}

/**
 * Resolve the service principal's scope (tenant + user). Returns null when the
 * service JWT is not configured or does not resolve — the scheduler then stays
 * off and says so, rather than half-running.
 */
export async function resolveSchedulerServiceScope(): Promise<AiSessionScope | null> {
  const serviceJwt = getSchedulerServiceJwt();
  if (!serviceJwt) {
    return null;
  }
  const resolved = await createCoreAiScopeResolver()({
    authorization: `Bearer ${serviceJwt}`,
  });
  if (!resolved.ok) {
    return null;
  }
  return { ...resolved.scope, userAccessToken: serviceJwt };
}

/** Module-operation invoker riding the service JWT. */
export function createSchedulerOperationInvoker(): SchedulerOperationInvoker {
  return async (operationId, input) => {
    const serviceJwt = getSchedulerServiceJwt();
    const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
    if (!(serviceJwt && coreBaseUrl)) {
      throw new Error(
        "scheduler: ENGENTY_AI_SERVICE_JWT and a core base URL are required for scheduled trigger fires"
      );
    }
    const client = new EngentyCoreClient({
      coreBaseUrl,
      userAccessToken: serviceJwt,
    });
    return client.invokeTool(operationId, input ?? {});
  };
}
