import { describe, expect, it } from "vitest";
import { hasManageCapability } from "./shared.js";

describe("hasManageCapability", () => {
  it("denies a bare service principal without the manage capability", () => {
    // Regression: a `service` principalType must NOT be a shortcut to user
    // management. Only explicit capabilities grant it.
    expect(
      hasManageCapability({ capabilities: [], principalType: "service" })
    ).toBe(false);
    expect(
      hasManageCapability({
        capabilities: ["module.read", "module.write"],
        principalType: "service",
      })
    ).toBe(false);
  });

  it("allows explicit core.users.manage regardless of principal type", () => {
    for (const principalType of ["user", "agent", "service"] as const) {
      expect(
        hasManageCapability({
          capabilities: ["core.users.manage"],
          principalType,
        })
      ).toBe(true);
    }
  });

  it("allows wildcard grants", () => {
    expect(
      hasManageCapability({
        capabilities: ["core.*"],
        principalType: "service",
      })
    ).toBe(true);
    expect(
      hasManageCapability({ capabilities: ["*"], principalType: "user" })
    ).toBe(true);
  });

  it("denies a null auth", () => {
    expect(hasManageCapability(null)).toBe(false);
  });
});
