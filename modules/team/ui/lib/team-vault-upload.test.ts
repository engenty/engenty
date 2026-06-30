import { describe, expect, it } from "vitest";
import { buildTeamMemberPhotoVaultKey } from "./team-vault-upload.js";

describe("buildTeamMemberPhotoVaultKey", () => {
  it("uses team/members profile segment", () => {
    expect(
      buildTeamMemberPhotoVaultKey({
        tenantId: "t1",
        profileId: "p1",
        filename: "photo.png",
        kind: "profile",
        timestamp: 100,
      })
    ).toBe("tenants/t1/team/members/p1/profile/100_photo.png");
  });
});
