import { describe, expect, it } from "vitest";
import type { TeamMemberListItem } from "../api.js";
import type { TeamMembersColumnVisibility } from "../components/team-members-display-dialog.js";
import {
  TEAM_MEMBERS_CARD_PINNED_COLUMN,
  teamMemberCardBodyLines,
  teamMembersDisplayColumnsForViewMode,
} from "./team-members-card-fields.js";

const member = {
  id: "m1",
  full_name: "Alex Example",
  position: "Engineer",
  department: "Product",
  location: "Berlin",
  phone: "+49 1",
  reports_to_display_name: "Pat Manager",
} as TeamMemberListItem;

const allVisible: TeamMembersColumnVisibility = {
  avatar: true,
  linkedUser: false,
  fullName: false,
  position: true,
  department: false,
  location: true,
  phone: false,
  reportsTo: true,
};

describe("teamMembersDisplayColumnsForViewMode", () => {
  const columns = [
    { key: "avatar" as const, label: "Avatar" },
    { key: "fullName" as const, label: "Name" },
    { key: "phone" as const, label: "Phone" },
  ];

  it("removes fullName from configurator columns in cards view", () => {
    expect(
      teamMembersDisplayColumnsForViewMode("cards", columns).map((c) => c.key)
    ).toEqual(["avatar", "phone"]);
  });

  it("keeps all columns in table view", () => {
    expect(
      teamMembersDisplayColumnsForViewMode("table", columns).map((c) => c.key)
    ).toEqual(["avatar", "fullName", "phone"]);
  });
});

describe("teamMemberCardBodyLines", () => {
  const labels = { noManager: "No manager" };

  it("returns only visible body fields in column order", () => {
    const lines = teamMemberCardBodyLines(
      member,
      ["reportsTo", "position", "department", "location", "phone"],
      allVisible,
      labels
    );
    expect(lines.map((line) => line.key)).toEqual([
      "reportsTo",
      "position",
      "location",
    ]);
    expect(lines[0]?.value).toBe("Pat Manager");
    expect(lines[1]?.value).toBe("Engineer");
  });

  it("pins fullName outside body lines regardless of visibility", () => {
    expect(TEAM_MEMBERS_CARD_PINNED_COLUMN).toBe("fullName");
    const lines = teamMemberCardBodyLines(
      member,
      ["fullName"],
      allVisible,
      labels
    );
    expect(lines.map((line) => line.key)).not.toContain("fullName");
  });
});
