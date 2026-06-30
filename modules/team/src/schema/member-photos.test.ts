import { describe, expect, it } from "vitest";
import {
  assertTeamMemberPhotoStorageKey,
  teamMemberPhotoStorageKey,
} from "./member-photos.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROFILE = "prof-1";

describe("teamMemberPhotoStorageKey", () => {
  it("builds profile image key under team/members", () => {
    expect(
      teamMemberPhotoStorageKey({
        tenant_id: TENANT,
        profile_id: PROFILE,
        filename: "head shot.png",
        kind: "profile",
        timestamp: 1_700_000_000_000,
      })
    ).toBe(
      `tenants/${TENANT}/team/members/${PROFILE}/profile/1700000000000_head_shot.png`
    );
  });

  it("builds gallery key", () => {
    expect(
      teamMemberPhotoStorageKey({
        tenant_id: TENANT,
        profile_id: PROFILE,
        filename: "office.jpg",
        kind: "gallery",
        timestamp: 42,
      })
    ).toBe(`tenants/${TENANT}/team/members/${PROFILE}/gallery/42_office.jpg`);
  });
});

describe("assertTeamMemberPhotoStorageKey", () => {
  it("accepts keys under the expected prefix", () => {
    const key = teamMemberPhotoStorageKey({
      tenant_id: TENANT,
      profile_id: PROFILE,
      filename: "a.webp",
      kind: "gallery",
    });
    expect(() =>
      assertTeamMemberPhotoStorageKey({
        storage_key: key,
        tenant_id: TENANT,
        profile_id: PROFILE,
        kind: "gallery",
      })
    ).not.toThrow();
  });

  it("rejects keys outside member prefix", () => {
    expect(() =>
      assertTeamMemberPhotoStorageKey({
        storage_key: `tenants/${TENANT}/team/members/other/gallery/x.png`,
        tenant_id: TENANT,
        profile_id: PROFILE,
        kind: "gallery",
      })
    ).toThrow("invalid_team_member_photo_storage_key");
  });
});
