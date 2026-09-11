import { describe, expect, it } from "vitest";
import { capabilitiesForUser, clampCapabilities } from "./user-capabilities.js";

describe("capabilitiesForUser", () => {
  it("derives each role's bundle from CORE_ROLE_PROFILES", () => {
    // `core.credentials.manage` is redundant against `*` for the matcher, and
    // listed on the profile anyway so the power to mint durable credentials is
    // named rather than implied (AUTH-02).
    expect(
      capabilitiesForUser({ isSuperAdmin: false, tenantRole: "admin" })
    ).toEqual(["core.credentials.manage", "*"]);
    // Members are capable staff: module.* plus their own + tenant settings.
    // This must match the tenant.member profile the grants path resolves.
    expect(
      capabilitiesForUser({ isSuperAdmin: false, tenantRole: "member" })
    ).toEqual([
      "module.*",
      "tenant-settings.read",
      "tenant-settings.write",
      "user-settings.read",
      "user-settings.write",
      "notifications.read",
      "notifications.write",
    ]);
    // A user who is not a member of the tenant gets nothing (matches
    // resolveGrants' base === null → empty).
    expect(
      capabilitiesForUser({ isSuperAdmin: false, tenantRole: null })
    ).toEqual([]);
  });

  it("superadmin gets core.superadmin", () => {
    expect(
      capabilitiesForUser({ isSuperAdmin: true, tenantRole: null })
    ).toContain("core.superadmin");
  });
});

describe("clampCapabilities", () => {
  it("empty request yields the full granted set", () => {
    expect(clampCapabilities([], ["*"])).toEqual(["*"]);
    expect(clampCapabilities([], ["module.read"])).toEqual(["module.read"]);
  });

  it("wildcard grant covers specific requests", () => {
    expect(clampCapabilities(["module.read", "module.write"], ["*"])).toEqual([
      "module.read",
      "module.write",
    ]);
  });

  it("specific grant does NOT widen to a requested wildcard", () => {
    expect(clampCapabilities(["*"], ["module.read"])).toEqual([]);
    expect(clampCapabilities(["core.superadmin"], ["module.read"])).toEqual([]);
  });

  it("prefix wildcards in the grant cover same-prefix requests", () => {
    expect(clampCapabilities(["module.read"], ["module.*"])).toEqual([
      "module.read",
    ]);
    expect(clampCapabilities(["other.read"], ["module.*"])).toEqual([]);
  });

  it("clamps a member to their bundle: module.* yes, core.superadmin no", () => {
    const member = capabilitiesForUser({
      isSuperAdmin: false,
      tenantRole: "member",
    });
    // module.write is covered by the member's module.* grant; core.superadmin
    // is not, so it is dropped — a member can never clamp UP to superadmin.
    expect(
      clampCapabilities(["module.write", "core.superadmin"], member)
    ).toEqual(["module.write"]);
    expect(clampCapabilities(["user-settings.read"], member)).toEqual([
      "user-settings.read",
    ]);
  });

  it("never returns capabilities outside the grant (spot property check)", () => {
    const grants = [["*"], ["module.*"], ["module.read"], []];
    const requests = [
      [],
      ["*"],
      ["module.read"],
      ["module.write", "core.superadmin"],
    ];
    for (const granted of grants) {
      for (const requested of requests) {
        for (const result of clampCapabilities(requested, granted)) {
          const covered =
            granted.includes("*") ||
            granted.includes(result) ||
            granted.includes(`${result.split(".")[0]}.*`);
          expect(covered).toBe(true);
        }
      }
    }
  });
});
