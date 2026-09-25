import { describe, expect, it } from "vitest";
import { grantAllowsSpace } from "./grants.js";

describe("MCP client grants", () => {
  it("requires an explicitly granted Space", () => {
    const grant = {
      clientId: "cursor",
      maxRiskLevel: "medium" as const,
      spaceIds: ["space-1", "space-2"],
      tenantId: "t",
      userId: "u",
    };
    expect(grantAllowsSpace(grant, "space-1")).toBe(true);
    expect(grantAllowsSpace(grant, "space-3")).toBe(false);
    expect(grantAllowsSpace(grant, undefined)).toBe(false);
    expect(
      grantAllowsSpace({ ...grant, spaceIds: ["space-1"] }, undefined)
    ).toBe(true);
  });
});
