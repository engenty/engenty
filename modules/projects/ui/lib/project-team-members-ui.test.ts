import { describe, expect, it } from "vitest";
import { buildProjectTaskMemberOptions } from "./project-team-members-ui.js";

const catalog = [
  { id: "tm-2", user_id: "u-2", full_name: "Chris Pine" },
  { id: "tm-3", user_id: "u-3", full_name: "Alex Ray" },
  { id: "tm-1", user_id: "u-1", full_name: "Bea Stone" },
] as const;

describe("project team member UI helpers", () => {
  it("groups task assignees so project members appear first", () => {
    expect(
      buildProjectTaskMemberOptions({
        catalog: [...catalog],
        projectMemberIds: ["u-1"],
        inProjectLabel: "In project",
        otherTeamMembersLabel: "Other team members",
      })
    ).toEqual([
      {
        heading: "In project",
        options: [{ value: "u-1", label: "Bea Stone" }],
      },
      {
        heading: "Other team members",
        options: [
          { value: "u-3", label: "Alex Ray" },
          { value: "u-2", label: "Chris Pine" },
        ],
      },
    ]);
  });

  it("falls back to a flat sorted list when the project has no members yet", () => {
    expect(
      buildProjectTaskMemberOptions({
        catalog: [...catalog],
        projectMemberIds: [],
        inProjectLabel: "In project",
        otherTeamMembersLabel: "Other team members",
      })
    ).toEqual([
      { value: "u-3", label: "Alex Ray" },
      { value: "u-1", label: "Bea Stone" },
      { value: "u-2", label: "Chris Pine" },
    ]);
  });

  it("includes profile-only team members using profile id values", () => {
    expect(
      buildProjectTaskMemberOptions({
        catalog: [
          ...catalog,
          { id: "tm-4", user_id: null, full_name: "No Login" },
        ],
        projectMemberIds: [],
        inProjectLabel: "In project",
        otherTeamMembersLabel: "Other team members",
      })
    ).toEqual([
      { value: "u-3", label: "Alex Ray" },
      { value: "u-1", label: "Bea Stone" },
      { value: "u-2", label: "Chris Pine" },
      { value: "tm-4", label: "No Login" },
    ]);
  });

  it("matches project members stored as profile ids", () => {
    expect(
      buildProjectTaskMemberOptions({
        catalog: [{ id: "tm-1", user_id: "u-1", full_name: "Bea Stone" }],
        projectMemberIds: ["tm-1"],
        inProjectLabel: "In project",
        otherTeamMembersLabel: "Other team members",
      })
    ).toEqual([
      {
        heading: "In project",
        options: [{ value: "u-1", label: "Bea Stone" }],
      },
    ]);
  });
});
