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

export type SchedulerServiceScopeResolution =
  | { ok: true; scope: AiSessionScope }
  | { ok: false; reason: "jwt_missing" }
  | { error: string; ok: false; reason: "resolution_failed"; status: number };

export function getSchedulerServiceJwt(): string | null {
  return process.env.ENGENTY_AI_SERVICE_JWT?.trim() || null;
}

/**
 * Resolve the service principal's scope (tenant + user). Failures are split
 * into `jwt_missing` (env var not set — permanent for this process) and
 * `resolution_failed` (core unreachable or rejecting — possibly a boot race,
 * worth retrying) so the caller can react accordingly.
 */
export async function resolveSchedulerServiceScope(): Promise<SchedulerServiceScopeResolution> {
  const serviceJwt = getSchedulerServiceJwt();
  if (!serviceJwt) {
    return { ok: false, reason: "jwt_missing" };
  }
  const resolved = await createCoreAiScopeResolver()({
    authorization: `Bearer ${serviceJwt}`,
  });
  if (!resolved.ok) {
    return {
      error: resolved.error,
      ok: false,
      reason: "resolution_failed",
      status: resolved.status,
    };
  }
  return {
    ok: true,
    scope: { ...resolved.scope, userAccessToken: serviceJwt },
  };
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
