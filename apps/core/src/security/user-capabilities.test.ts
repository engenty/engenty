import { describe, expect, it } from "vitest";
import { capabilitiesForUser } from "./user-capabilities.js";

describe("capabilitiesForUser", () => {
  it("gives a user who is not a member of the tenant nothing", () => {
    expect(
      capabilitiesForUser({ isSuperAdmin: false, tenantRole: null })
    ).toEqual([]);
  });
});
