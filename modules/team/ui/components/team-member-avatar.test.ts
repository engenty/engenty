import { describe, expect, it } from "vitest";
import { teamMemberAvatarInitials } from "../components/team-member-avatar.js";

describe("teamMemberAvatarInitials", () => {
  it("uses explicit initials when provided", () => {
    expect(teamMemberAvatarInitials("Jane Doe", "JD")).toBe("JD");
  });

  it("derives initials from full name when missing", () => {
    expect(teamMemberAvatarInitials("Jane Doe", null)).toBe("JA");
  });
});
