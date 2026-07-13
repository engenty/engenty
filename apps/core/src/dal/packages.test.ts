import {
  type EntitlementPackage,
  resolveEntitlements,
} from "@engenty/entitlements";
import { describe, expect, it } from "vitest";
import { selectStalePackages, toTenantUsagePolicyRow } from "./packages.js";

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
    },
    appLimits: { maxUsers: null, enforcement_mode: "observe" },
  };
}

describe("selectStalePackages", () => {
  const catalog = [pkg("free", 2), pkg("team", 3)];

  it("upserts entries missing from the DB", () => {
    expect(selectStalePackages(new Map(), catalog).map((p) => p.id)).toEqual([
      "free",
      "team",
    ]);
  });

  it("upserts only entries whose DB version is older", () => {
    const existing = new Map([
      ["free", 2], // same version — skip
      ["team", 1], // older — upsert
    ]);
    expect(selectStalePackages(existing, catalog).map((p) => p.id)).toEqual([
      "team",
    ]);
  });

  it("never downgrades: a newer DB version is left alone", () => {
    const existing = new Map([
      ["free", 5],
      ["team", 9],
    ]);
    expect(selectStalePackages(existing, catalog)).toEqual([]);
  });
});

describe("toTenantUsagePolicyRow", () => {
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

  it("uses tier 'free' when no package is assigned", () => {
    const row = toTenantUsagePolicyRow("t1", resolveEntitlements(null));
    expect(row.tier).toBe("free");
    expect(row.enforcement_mode).toBe("observe");
  });
});
