/**
 * Test double for the tenant-scoped DB source (Phase A, see
 * PLAN-tenant-isolation-a-rls-seam.md).
 *
 * Why this exists: `normalizeDbSource` accepts either a plain SupabaseClient or
 * a TenantScopedDbSource. The plain-client branch returns `forTenant: () =>
 * client` — it DISCARDS the tenantId. Every store test used to pass a bare fake
 * client, so it exercised that branch, and therefore could not detect a store
 * that asked for the wrong tenant, asked for an empty tenant, or stopped asking
 * for a tenant handle at all and quietly ran on the service lane. The tests
 * asserted on rows while the thing that actually matters — the tenant binding —
 * did not exist in the scenario under test.
 *
 * This wraps an existing fake client in the REAL shape and records the binding,
 * so a store losing it becomes a test failure rather than an identical pass.
 *
 * It also reproduces production's refusal of an empty tenantId (see
 * getTenantDb in apps/ai/src/infra/tenant-db.ts), so a store that would throw
 * against a real database throws here too instead of sailing through.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantScopedDbSource } from "../../infra/tenant-db.js";

export interface RecordingDbSource {
  /** Fails the expectation unless the ONLY tenant bound was this one. */
  assertOnlyTenant(tenantId: string): void;
  /** The source to hand to the store factory. */
  source: TenantScopedDbSource;
  /** Every tenantId the store resolved a handle for, in call order. */
  readonly tenantCalls: string[];
  /** True when the store never resolved a tenant handle (service-lane only). */
  usedTenantLane(): boolean;
}

/**
 * @param tenantClient  fake client returned for tenant-scoped work
 * @param serviceClient fake client returned for the service lane; defaults to
 *   `tenantClient` so existing single-fake tests keep working. Pass a DISTINCT
 *   object when the test wants to prove which lane a call went through.
 */
export function createRecordingDbSource(
  tenantClient: unknown,
  serviceClient?: unknown
): RecordingDbSource {
  const tenantCalls: string[] = [];
  const source: TenantScopedDbSource = {
    getTenantDb: ({ tenantId }: { tenantId: string }) => {
      if (!tenantId?.trim()) {
        // Mirrors production: an empty tenant is a bug, not a wildcard.
        throw new Error(
          "getTenantDb requires a non-empty tenantId (recording test source)."
        );
      }
      tenantCalls.push(tenantId);
      return tenantClient as SupabaseClient;
    },
    serviceDb: (serviceClient ?? tenantClient) as SupabaseClient,
  };

  return {
    assertOnlyTenant(tenantId: string) {
      const others = [...new Set(tenantCalls)].filter((id) => id !== tenantId);
      if (tenantCalls.length === 0) {
        throw new Error(
          `expected the store to resolve a tenant handle for ${tenantId}, but it never asked for one — it ran entirely on the service lane`
        );
      }
      if (others.length > 0) {
        throw new Error(
          `expected every tenant handle to be ${tenantId}, but the store also asked for: ${others.join(", ")}`
        );
      }
    },
    source,
    tenantCalls,
    usedTenantLane: () => tenantCalls.length > 0,
  };
}
