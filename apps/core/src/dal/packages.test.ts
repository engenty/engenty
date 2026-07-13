import type { EntitlementPackage } from "@engenty/entitlements";
import { describe, expect, it } from "vitest";
import { selectStalePackages } from "./packages.js";

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
