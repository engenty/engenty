import { describe, expect, it } from "vitest";
import type { TeamMemberListItem } from "../api.js";
import {
  optimisticTeamMember,
  teamMemberMatchesList,
} from "./team-member-list-optimistic.js";
import {
  patchTeamMember,
  patchTeamMemberDetailPage,
} from "./team-member-optimistic-cache.js";

describe("team member optimistic cache reducers", () => {
  it("patches detail and composite page data immutably", () => {
    const member = {
      email: "before@example.com",
      full_name: "Before",
      id: "member-1",
    } as unknown as TeamMemberListItem;

    const detail = patchTeamMember(member, { full_name: "After" });
    const page = patchTeamMemberDetailPage({ member }, { full_name: "After" });

    expect(detail?.full_name).toBe("After");
    expect(page?.member.full_name).toBe("After");
    expect(member.full_name).toBe("Before");
  });

  it("does not synthesize uncached detail data", () => {
    expect(patchTeamMember(undefined, { full_name: "After" })).toBeUndefined();
    expect(
      patchTeamMemberDetailPage(undefined, { full_name: "After" })
    ).toBeUndefined();
  });

  it("builds a temporary member for immediate list rendering", () => {
    const member = optimisticTeamMember(
      { full_name: "Immediate" } as never,
      "opt_member"
    );
    expect(member.id).toBe("opt_member");
    expect(member.full_name).toBe("Immediate");
    expect(member.member_type).toBe("internal");
  });

  it("keeps temporary members out of unprojectable or mismatched filters", () => {
    const member = optimisticTeamMember(
      {
        email: "ada@example.com",
        full_name: "Ada Lovelace",
        location_term_id: "location-1",
        role_term_id: "role-1",
      } as never,
      "opt_member"
    );

    expect(teamMemberMatchesList(member, { search: "lovelace" })).toBe(true);
    expect(
      teamMemberMatchesList(member, { location_term_id: "location-2" })
    ).toBe(false);
    expect(teamMemberMatchesList(member, { role_term_id: "role-2" })).toBe(
      false
    );
    expect(teamMemberMatchesList(member, { group_id: "group-1" })).toBe(false);
  });
});
