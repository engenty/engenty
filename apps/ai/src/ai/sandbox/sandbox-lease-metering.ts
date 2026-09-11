import { type AiUsageStore, recordAiUsage } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";

import { setSandboxLeaseObserver } from "./sandbox-admission.js";

const logger = createLogger({ name: "apps/ai/sandbox-lease-metering" });

// Compute leases have no model. The usage event still needs one, so they carry
// a reserved id that no gateway model can collide with; pricing lookups miss it
// and the row lands at zero cost, which is correct until compute is priced.
const COMPUTE_LEASE_MODEL_ID = "sandbox";

/**
 * Meter finished sandbox leases as usage events.
 *
 * Host time is the resource a sandbox actually spends, and it is invisible in
 * token accounting: a run that idles a container for an hour while calling one
 * cheap model looks free. Metering the lease puts that time on the same ledger
 * as the tokens, per tenant and per space.
 *
 * Installed once at app build. Passing a null store detaches the observer,
 * which is what a test harness with no usage store wants.
 */
export function installSandboxLeaseMetering(
  usageStore: AiUsageStore | null
): void {
  if (!usageStore) {
    setSandboxLeaseObserver(null);
    return;
  }
  setSandboxLeaseObserver((lease) => {
    if (!lease.tenantId) {
      return;
    }
    // Fire and forget: a teardown must not wait on the billing write, and must
    // not fail if it fails.
    void recordAiUsage({
      compute_ms: lease.durationMs,
      feature: "compute_lease",
      model_id: COMPUTE_LEASE_MODEL_ID,
      run_id: lease.runId ?? null,
      space_id: lease.spaceId ?? null,
      store: usageStore,
      tenant_id: lease.tenantId,
      usage: {},
      user_id: null,
    }).catch((err) => {
      logger.warn("compute lease metering failed", {
        message: err instanceof Error ? err.message : String(err),
        sandboxId: lease.sandboxId,
      });
    });
  });
}
