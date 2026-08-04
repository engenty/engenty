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
 *
 * `tenantId` scopes the mint to one tenant (platform credential); omitted it
 * resolves the credential's own tenant.
 */
export async function resolveSchedulerServiceScope(
  tenantId?: string
): Promise<SchedulerServiceScopeResolution> {
  if (!isServiceCredentialConfigured()) {
    return { ok: false, reason: "jwt_missing" };
  }
  let serviceJwt: string | null;
  try {
    serviceJwt = await getServiceAccessToken(
      tenantId ? { tenantId } : undefined
    );
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
    scope: {
      ...resolved.scope,
      credential: { kind: "service", token: serviceJwt },
    },
  };
}

/** Tokens whose tenant has been verified against core, so the per-invocation
 * assertion costs one scope resolution per minted token, not per call.
 * Bounded: tokens rotate every ~15 min, and the map is cleared when it grows
 * past a size no healthy deployment reaches. */
const verifiedTokenTenants = new Map<string, string>();

/** Module-operation invoker riding the service identity. The token is fetched
 * per invocation — a fire days after boot must not ride a token minted at
 * boot. `tenantId` pins every mint to that tenant (a schedule's fires act for
 * the tenant stamped in its metadata, never the credential's default) and is
 * ASSERTED against the token's actual tenant: a tenant-bound credential would
 * otherwise execute tenant B's operation inside tenant A without any error —
 * the same belt the task-job path wears (task-job-scope.ts). */
export function createSchedulerOperationInvoker(
  tenantId?: string
): SchedulerOperationInvoker {
  return async (operationId, input) => {
    const serviceJwt = await getServiceAccessToken(
      tenantId ? { tenantId } : undefined
    );
    if (serviceJwt && tenantId) {
      let actual = verifiedTokenTenants.get(serviceJwt);
      if (actual === undefined) {
        const resolved = await createCoreAiScopeResolver()({
          authorization: `Bearer ${serviceJwt}`,
        });
        if (!resolved.ok) {
          throw new Error(
            `scheduler: failed to verify the service token's tenant before invoking ${operationId} — ${resolved.error}`
          );
        }
        if (verifiedTokenTenants.size > 64) {
          verifiedTokenTenants.clear();
        }
        actual = resolved.scope.tenantId;
        verifiedTokenTenants.set(serviceJwt, actual);
      }
      if (actual !== tenantId) {
        throw new Error(
          `scheduler: operation ${operationId} for tenant ${tenantId} would run on a service token scoped to tenant ${actual} — the configured credential cannot serve this tenant (configure ENGENTY_AI_SERVICE_SECRET with a platform-scoped credential)`
        );
      }
    }
    const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
    if (!(serviceJwt && coreBaseUrl)) {
      throw new Error(
        "scheduler: a service credential (ENGENTY_AI_SERVICE_SECRET) and a core base URL are required for scheduled trigger fires"
      );
    }
    const client = new EngentyCoreClient({
      coreBaseUrl,
      accessToken: serviceJwt,
    });
    return client.invokeTool(operationId, input ?? {});
  };
}
