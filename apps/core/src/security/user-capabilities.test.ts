import { describe, expect, it } from "vitest";
import { capabilitiesForUser, clampCapabilities } from "./user-capabilities.js";

describe("capabilitiesForUser", () => {
  it("matches the historical auth-provider fallback per role", () => {
    expect(
      capabilitiesForUser({ isSuperAdmin: false, tenantRole: "admin" })
    ).toEqual(["*"]);
    expect(
      capabilitiesForUser({ isSuperAdmin: false, tenantRole: "member" })
    ).toEqual([
      "tenant-settings.read",
      "tenant-settings.write",
      "user-settings.read",
      "user-settings.write",
    ]);
    expect(
      capabilitiesForUser({ isSuperAdmin: false, tenantRole: null })
    ).toEqual(
      capabilitiesForUser({ isSuperAdmin: false, tenantRole: "member" })
    );
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

  it("drops disjoint requests; member cannot gain module.write", () => {
    const member = capabilitiesForUser({
      isSuperAdmin: false,
      tenantRole: "member",
    });
    expect(
      clampCapabilities(["module.write", "core.superadmin"], member)
    ).toEqual([]);
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
