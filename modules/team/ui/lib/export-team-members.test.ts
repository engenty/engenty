import { describe, expect, it } from "vitest";
import type { TeamMemberListItem } from "../api.js";
import {
  buildTeamMemberExportColumns,
  teamMembersToExportRows,
} from "./export-team-members.js";

const sampleMember = {
  id: "member-1",
  full_name: "Alex Example",
  email: "alex@example.com",
  position: "Engineer",
  department: "Product",
  location: "Berlin",
  location_term: "berlin",
  phone: "+49 30 123456",
  role_term: "developer",
  role_term_id: "01934567-0000-7000-8000-000000000003",
  location_term_id: "01934567-0000-7000-8000-000000000004",
  member_type: "internal",
  created_at: "2026-01-01T00:00:00.000Z",
  reports_to_display_name: "Pat Manager",
} as TeamMemberListItem;

const labels = {
  avatar: "Avatar",
  linkedUser: "User Account",
  fullName: "Name",
  position: "Position",
  department: "Department",
  location: "Location",
  phone: "Phone",
  reportsTo: "Reports to",
  email: "Email",
  role: "Role",
  memberType: "Type",
  createdAt: "Created",
};

describe("buildTeamMemberExportColumns", () => {
  it("returns visible list columns in order", () => {
    const columns = buildTeamMemberExportColumns(
      {
        visible: {
          columnVisibility: {
            avatar: false,
            linkedUser: false,
            fullName: true,
            position: true,
            department: false,
            location: true,
            phone: false,
            reportsTo: true,
          },
          columnOrder: [
            "fullName",
            "position",
            "department",
            "location",
            "phone",
            "reportsTo",
          ],
        },
      },
      labels
    );

    expect(columns.map((column) => column.key)).toEqual([
      "full_name",
      "position",
      "location",
      "reports_to_display_name",
    ]);
  });

  it("includes extended fields for all-column export", () => {
    const columns = buildTeamMemberExportColumns("all", labels);

    expect(columns.map((column) => column.key)).toEqual([
      "full_name",
      "email",
      "position",
      "department",
      "location",
      "phone",
      "role_term",
      "role_term_id",
      "location_term_id",
      "member_type",
      "created_at",
    ]);
  });
});

describe("teamMembersToExportRows", () => {
  it("maps member values into export rows", () => {
    const columns = buildTeamMemberExportColumns(
      {
        visible: {
          columnVisibility: {
            avatar: false,
            linkedUser: false,
            fullName: true,
            position: true,
            department: true,
            location: true,
            phone: true,
            reportsTo: false,
          },
          columnOrder: [
            "fullName",
            "position",
            "department",
            "location",
            "phone",
          ],
        },
      },
      labels
    );

    expect(teamMembersToExportRows([sampleMember], columns)).toEqual([
      ["Name", "Position", "Department", "Location", "Phone"],
      ["Alex Example", "Engineer", "Product", "berlin", "+49 30 123456"],
    ]);
  });
});
