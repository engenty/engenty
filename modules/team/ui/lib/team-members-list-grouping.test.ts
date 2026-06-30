import { describe, expect, it } from "vitest";
import type { TeamMemberListItem } from "../api.js";
import {
  buildTeamMembersListGroups,
  resolveTeamMemberListGroupKey,
} from "./team-members-list-grouping.js";

function member(
  overrides: Partial<TeamMemberListItem> & Pick<TeamMemberListItem, "id">
): TeamMemberListItem {
  return {
    birth_name: null,
    created_at: "2026-01-01T00:00:00.000Z",
    department: null,
    email: null,
    first_name: null,
    full_name: "Member",
    full_name_override: null,
    import_id: null,
    initials: null,
    last_imported_at: null,
    last_name: null,
    location: null,
    member_type: "internal",
    middle_name: null,
    name_prefix: null,
    name_suffix: null,
    phone: null,
    phonetic_name: null,
    position: null,
    scope_id: "scope",
    tenant_id: "tenant",
    updated_at: "2026-01-01T00:00:00.000Z",
    user_id: null,
    ...overrides,
  };
}

describe("resolveTeamMemberListGroupKey", () => {
  it("maps department grouping to trimmed department or ungrouped label", () => {
    expect(
      resolveTeamMemberListGroupKey(
        member({ id: "1", department: "  Team Gföhler  " }),
        "department",
        "Unassigned"
      )
    ).toBe("Team Gföhler");
    expect(
      resolveTeamMemberListGroupKey(
        member({ id: "1", department: "   " }),
        "department",
        "Unassigned"
      )
    ).toBe("Unassigned");
  });

  it("maps role grouping to position and location grouping to location", () => {
    expect(
      resolveTeamMemberListGroupKey(
        member({ id: "1", position: "Engineer" }),
        "role",
        "Unassigned"
      )
    ).toBe("Engineer");
    expect(
      resolveTeamMemberListGroupKey(
        member({ id: "1", location: "Vienna" }),
        "location",
        "Unassigned"
      )
    ).toBe("Vienna");
  });
});

describe("buildTeamMembersListGroups", () => {
  it("returns a single unlabeled group when groupBy is none", () => {
    const members = [member({ id: "1" }), member({ id: "2" })];
    expect(buildTeamMembersListGroups(members, "none", "Unassigned")).toEqual([
      { key: "__all__", label: "", members },
    ]);
  });

  it("sorts groups alphabetically by label and buckets members", () => {
    const members = [
      member({ id: "1", department: "Beta" }),
      member({ id: "2", department: "Alpha" }),
      member({ id: "3", department: null }),
      member({ id: "4", department: "Alpha" }),
    ];

    const groups = buildTeamMembersListGroups(
      members,
      "department",
      "Unassigned"
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Alpha",
      "Beta",
      "Unassigned",
    ]);
    expect(groups[0]?.members.map((m) => m.id)).toEqual(["2", "4"]);
    expect(groups[2]?.members.map((m) => m.id)).toEqual(["3"]);
  });
});
