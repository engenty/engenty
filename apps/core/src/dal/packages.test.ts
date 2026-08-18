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

  it("seeds entries missing from the DB", () => {
    expect(selectSeedablePackages(new Map(), catalog).map((p) => p.id)).toEqual(
      ["free", "team"]
    );
  });

  it("never overwrites an existing row, even for a newer authored version", () => {
    // `core.packages` is operator-editable in the manage console. Re-seeding on
    // a version bump used to silently revert those edits on the next boot.
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

  it("maps resolved entitlements to the ai.tenant_usage_policy columns", () => {
    const resolved = resolveEntitlements(pkg("team", 1), {
      aiUsagePolicy: {
        hard_limit_cost_micros: 42,
        enforcement_mode: "enforce",
      },
    });
    const row = toTenantUsagePolicyRow("t1", resolved);
    expect(row.tenant_id).toBe("t1");
    // package id supersedes the free-text tier
    expect(row.tier).toBe("team");
    expect(row.hard_limit_cost_micros).toBe(42);
    expect(row.enforcement_mode).toBe("enforce");
    expect(row.period_unit).toBe("month");
  });

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
