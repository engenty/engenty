import { describe, expect, it } from "vitest";
import { canManageStream, hasManageCapability } from "./manage.js";

const deps = {
  isSpaceOwner: async ({
    spaceId,
    userId,
  }: {
    spaceId: string;
    userId: string;
  }) => spaceId === "s1" && userId === "u1",
};

describe("canManageStream", () => {
  it("admins manage everything, owners their own space's streams only", async () => {
    expect(hasManageCapability({ capabilities: ["*"], userId: null })).toBe(
      true
    );
    expect(
      await canManageStream(
        { capabilities: ["notifications.manage"], userId: "u2" },
        { spaceId: null, tenantId: "t" },
        deps
      )
    ).toBe(true);
    expect(
      await canManageStream(
        { capabilities: ["notifications.read"], userId: "u1" },
        { spaceId: "s1", tenantId: "t" },
        deps
      )
    ).toBe(true);
    expect(
      await canManageStream(
        { capabilities: ["notifications.read"], userId: "u1" },
        { spaceId: "s2", tenantId: "t" },
        deps
      )
    ).toBe(false);
    // A tenant-global stream is never a space owner's to shape.
    expect(
      await canManageStream(
        { capabilities: [], userId: "u1" },
        { spaceId: null, tenantId: "t" },
        deps
      )
    ).toBe(false);
  });
});
