import { describe, expect, it } from "vitest";
import {
  clusterSecondaryNavGroups,
  groupSecondaryNavItems,
} from "./group-secondary-nav-items";

describe("groupSecondaryNavItems", () => {
  it("keeps unheaded links as items and folds heading runs into sections", () => {
    expect(
      groupSecondaryNavItems([
        { to: "/settings/spaces", label: "Spaces" },
        { to: "/settings/appearance", label: "Appearance" },
        { to: "", label: "", type: "separator" },
        { to: "", label: "Engenty", type: "heading" },
        { to: "/mdl/projects/settings", label: "Projects" },
        { to: "/mdl/tasks/settings", label: "Plan" },
        { to: "", label: "Other", type: "heading" },
        { to: "/mdl/engenty-copilot/memory", label: "Memory" },
        { to: "/settings/remote", label: "Remote channels" },
      ])
    ).toEqual([
      { type: "item", item: { to: "/settings/spaces", label: "Spaces" } },
      {
        type: "item",
        item: { to: "/settings/appearance", label: "Appearance" },
      },
      { type: "separator" },
      {
        type: "section",
        heading: "Engenty",
        items: [
          { to: "/mdl/projects/settings", label: "Projects" },
          { to: "/mdl/tasks/settings", label: "Plan" },
        ],
      },
      {
        type: "section",
        heading: "Other",
        items: [
          { to: "/mdl/engenty-copilot/memory", label: "Memory" },
          { to: "/settings/remote", label: "Remote channels" },
        ],
      },
    ]);
  });

  it("flushes a trailing heading with no children", () => {
    expect(
      groupSecondaryNavItems([{ to: "", label: "Work", type: "heading" }])
    ).toEqual([{ type: "section", heading: "Work", items: [] }]);
  });
});

describe("clusterSecondaryNavGroups", () => {
  it("stacks unheaded links and drops separators so sections can gap like the space Work list", () => {
    expect(
      clusterSecondaryNavGroups(
        groupSecondaryNavItems([
          { to: "/settings/spaces", label: "Spaces" },
          { to: "/settings/appearance", label: "Appearance" },
          { to: "", label: "", type: "separator" },
          { to: "", label: "Engenty", type: "heading" },
          { to: "/mdl/projects/settings", label: "Projects" },
          { to: "", label: "Work", type: "heading" },
          { to: "/mdl/tasks/settings", label: "Plan" },
        ])
      )
    ).toEqual([
      {
        type: "items",
        items: [
          { to: "/settings/spaces", label: "Spaces" },
          { to: "/settings/appearance", label: "Appearance" },
        ],
      },
      {
        type: "section",
        heading: "Engenty",
        items: [{ to: "/mdl/projects/settings", label: "Projects" }],
      },
      {
        type: "section",
        heading: "Work",
        items: [{ to: "/mdl/tasks/settings", label: "Plan" }],
      },
    ]);
  });
});
