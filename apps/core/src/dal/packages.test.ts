import { describe, expect, it } from "vitest";
import type { EntitlementPackage } from "../lib/entitlements-contract.js";
import { entitlements } from "../lib/entitlements-runtime.js";
import { selectSeedablePackages, toTenantUsagePolicyRow } from "./packages.js";

function pkg(id: string, version: number): EntitlementPackage {
  return {
    id,
    version,
    label: id,
    modules: null,
    featureFlags: {},
    aiUsagePolicy: {
      period_mode: "calendar",
      period_unit: "month",
      included_cost_micros: null,
      hard_limit_cost_micros: null,
      soft_limit_cost_micros: null,
      enforcement_mode: "observe",
      currency: "usd",
      allowed_models: null,
      allowed_providers: null,
      allowed_efforts: null,
    },
    appLimits: { maxUsers: null, enforcement_mode: "observe" },
  };
}

describe("selectSeedablePackages", () => {
  const catalog = [pkg("free", 2), pkg("team", 3)];

  it("never overwrites an existing row, even for a newer authored version", () => {
    // `core.packages` is operator-editable; re-seeding would revert those edits.
    const existing = new Map([
      ["free", 1], // authored 2 — still left alone
      ["team", 3],
    ]);
    expect(selectSeedablePackages(existing, catalog)).toEqual([]);
  });

  it("seeds only the genuinely absent entry", () => {
    const existing = new Map([["free", 2]]);
    expect(selectSeedablePackages(existing, catalog).map((p) => p.id)).toEqual([
      "team",
    ]);
  });
});

describe.skipIf(!entitlements)("toTenantUsagePolicyRow", () => {
  if (!entitlements) {
    return;
  }
  const { resolveEntitlements } = entitlements;

  it("marks a packaged tenant's policy as centrally managed", () => {
    const row = toTenantUsagePolicyRow(
      "t1",
      resolveEntitlements(pkg("team", 1))
    );
    // Locks the AI plane's tenant-facing PATCH route (409 policy_managed).
    expect(row.managed_by).toBe("entitlement");
  });

  it("uses tier 'free' and stays self-service when no package is assigned", () => {
    const row = toTenantUsagePolicyRow("t1", resolveEntitlements(null));
    expect(row.tier).toBe("free");
    expect(row.enforcement_mode).toBe("observe");
    // No plan → the tenant admin keeps self-service control.
    expect(row.managed_by).toBe("tenant");
  });
});
