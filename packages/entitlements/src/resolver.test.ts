import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENTITLEMENT_PACKAGES,
  findEntitlementPackage,
} from "./catalog.js";
import {
  checkSeatLimit,
  FREE_ENTITLEMENTS,
  isModuleLicensed,
  resolveEntitlements,
} from "./resolver.js";
import { parseEntitlementOverride } from "./schema.js";
import type { EntitlementPackage } from "./types.js";

const team = findEntitlementPackage("team") as EntitlementPackage;

describe("resolveEntitlements", () => {
  it("returns the free default (all modules, observe) with no package", () => {
    const resolved = resolveEntitlements(null);
    expect(resolved.packageId).toBeNull();
    expect(resolved.modules).toBeNull(); // null = no restriction
    expect(resolved.aiUsagePolicy.enforcement_mode).toBe("observe");
    expect(resolved.appLimits.maxUsers).toBeNull();
    expect(resolved).toEqual(FREE_ENTITLEMENTS);
  });

  it("resolves a package's own values when no override", () => {
    const resolved = resolveEntitlements(team);
    expect(resolved.packageId).toBe("team");
    expect(resolved.modules).toContain("projects");
    expect(resolved.appLimits.maxUsers).toBe(25);
    expect(resolved.aiUsagePolicy.hard_limit_cost_micros).toBe(40_000_000);
  });

  it("merges an override over the package: flags key-by-key, policy field-by-field", () => {
    const resolved = resolveEntitlements(team, {
      featureFlags: { "beta.new-thing": true },
      aiUsagePolicy: { hard_limit_cost_micros: 99_000_000 },
      appLimits: { maxUsers: 50 },
    });
    // package flag preserved, override flag added
    expect(resolved.featureFlags["kb.ai-triage"]).toBe(true);
    expect(resolved.featureFlags["beta.new-thing"]).toBe(true);
    // only the overridden policy field changes; the rest stay from the package
    expect(resolved.aiUsagePolicy.hard_limit_cost_micros).toBe(99_000_000);
    expect(resolved.aiUsagePolicy.included_cost_micros).toBe(20_000_000);
    // appLimits merges field-by-field, enforcement kept
    expect(resolved.appLimits.maxUsers).toBe(50);
    expect(resolved.appLimits.enforcement_mode).toBe("enforce");
  });

  it("lets an override replace the module allow-list, including lifting it to null", () => {
    expect(
      resolveEntitlements(team, { modules: ["contacts"] }).modules
    ).toEqual(["contacts"]);
    // explicit null lifts the restriction entirely
    expect(resolveEntitlements(team, { modules: null }).modules).toBeNull();
    // absent modules key keeps the package list
    expect(resolveEntitlements(team, { featureFlags: {} }).modules).toEqual(
      team.modules
    );
  });

  it("does not mutate the source package when merging", () => {
    const before = JSON.stringify(team);
    resolveEntitlements(team, {
      featureFlags: { x: true },
      appLimits: { maxUsers: 1 },
    });
    expect(JSON.stringify(team)).toBe(before);
  });
});

describe("isModuleLicensed", () => {
  it("permits everything when the allow-list is null", () => {
    expect(isModuleLicensed({ modules: null }, "anything")).toBe(true);
  });

  it("permits only listed modules otherwise", () => {
    expect(isModuleLicensed({ modules: ["contacts"] }, "contacts")).toBe(true);
    expect(isModuleLicensed({ modules: ["contacts"] }, "invoices")).toBe(false);
  });
});

describe("checkSeatLimit", () => {
  it("allows unlimited seats when maxUsers is null", () => {
    const r = checkSeatLimit(9999, {
      maxUsers: null,
      enforcement_mode: "enforce",
    });
    expect(r.allowed).toBe(true);
    expect(r.atLimit).toBe(false);
  });

  it("allows adds below the cap", () => {
    const r = checkSeatLimit(4, { maxUsers: 5, enforcement_mode: "enforce" });
    expect(r.allowed).toBe(true);
    expect(r.atLimit).toBe(false);
  });

  it("blocks at/over the cap in enforce mode", () => {
    const r = checkSeatLimit(5, { maxUsers: 5, enforcement_mode: "enforce" });
    expect(r.allowed).toBe(false);
    expect(r.atLimit).toBe(true);
    expect(r.current).toBe(5);
    expect(r.limit).toBe(5);
  });

  it("flags but still allows at the cap in observe mode", () => {
    const r = checkSeatLimit(6, { maxUsers: 5, enforcement_mode: "observe" });
    expect(r.allowed).toBe(true);
    expect(r.atLimit).toBe(true);
  });
});

describe("authored catalog", () => {
  it("has unique ids and positive versions", () => {
    const ids = DEFAULT_ENTITLEMENT_PACKAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pkg of DEFAULT_ENTITLEMENT_PACKAGES) {
      expect(pkg.version).toBeGreaterThan(0);
    }
  });
});

describe("parseEntitlementOverride", () => {
  it("accepts a sparse override payload", () => {
    const parsed = parseEntitlementOverride({ appLimits: { maxUsers: 10 } });
    expect(parsed.appLimits?.maxUsers).toBe(10);
    expect(parsed.aiUsagePolicy).toBeUndefined();
  });

  it("rejects an invalid enforcement mode", () => {
    expect(() =>
      parseEntitlementOverride({ appLimits: { enforcement_mode: "nope" } })
    ).toThrow();
  });
});
