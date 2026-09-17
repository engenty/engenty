import { describe, expect, it } from "vitest";
import { createMemoryMcpGrantStore, grantAllowsSpace } from "./grants.js";

describe("MCP client grants", () => {
  it("returns a live grant and hides revoked or expired rows", async () => {
    const store = createMemoryMcpGrantStore();
    await store.upsert({
      clientId: "cursor",
      maxRiskLevel: "medium",
      spaceIds: ["space-1"],
      tenantId: "tenant-1",
      userId: "user-1",
    });
    const live = await store.get({
      clientId: "cursor",
      tenantId: "tenant-1",
      userId: "user-1",
    });
    expect(live?.maxRiskLevel).toBe("medium");
    await store.revoke({
      clientId: "cursor",
      tenantId: "tenant-1",
      userId: "user-1",
    });
    expect(
      await store.get({
        clientId: "cursor",
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).toBeNull();
  });

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
