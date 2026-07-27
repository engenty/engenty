// Headless module-operation invoker for the trigger scheduler. Scheduled fires
// have no incoming HTTP request, so they act as the AI service principal —
// the same identity the task-job substrate uses. The token comes from the
// service-credential vendor per call, never captured at boot: the scheduler is
// a long-lived process and any captured token would outlive its expiry.
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import {
  getServiceAccessToken,
  isServiceCredentialConfigured,
} from "../ai/service-credential.js";
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

/**
 * Resolve the service principal's scope (tenant + user). Failures are split
 * into `jwt_missing` (no credential configured — permanent for this process)
 * and `resolution_failed` (core unreachable or rejecting — possibly a boot
 * race, worth retrying) so the caller can react accordingly. A configured
 * credential that fails to mint lands in `resolution_failed` too: a transient
 * Supabase hiccup at boot must not permanently disable the scheduler.
 */
export async function resolveSchedulerServiceScope(): Promise<SchedulerServiceScopeResolution> {
  if (!isServiceCredentialConfigured()) {
    return { ok: false, reason: "jwt_missing" };
  }
  let serviceJwt: string | null;
  try {
    serviceJwt = await getServiceAccessToken();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      ok: false,
      reason: "resolution_failed",
      status: 503,
    };
  }
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

/** Module-operation invoker riding the service identity. The token is fetched
 * per invocation — a fire days after boot must not ride a token minted at
 * boot. */
export function createSchedulerOperationInvoker(): SchedulerOperationInvoker {
  return async (operationId, input) => {
    const serviceJwt = await getServiceAccessToken();
    const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
    if (!(serviceJwt && coreBaseUrl)) {
      throw new Error(
        "scheduler: a service credential (ENGENTY_AI_SERVICE_JWT or ENGENTY_AI_SERVICE_EMAIL/PASSWORD) and a core base URL are required for scheduled trigger fires"
      );
    }
    const client = new EngentyCoreClient({
      coreBaseUrl,
      userAccessToken: serviceJwt,
    });
    return client.invokeTool(operationId, input ?? {});
  };
}
