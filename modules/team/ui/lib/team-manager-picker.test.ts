import { describe, expect, it } from "vitest";
import type { OrgTreeNode } from "../api.js";
import {
  buildManagerPickerOptions,
  flattenHumanOrgNodes,
  MANAGER_NONE,
  pickerValueFromReportsToId,
  reportsToIdFromPickerValue,
} from "./team-manager-picker.js";

const tree: OrgTreeNode[] = [
  {
    id: "ceo",
    kind: "human",
    profile_id: "p-ceo",
    agent_id: null,
    display_name: "CEO",
    display_title: null,
    icon: null,
    role_label: null,
    status: null,
    reports: [
      {
        id: "eng",
        kind: "human",
        profile_id: "p-eng",
        agent_id: null,
        display_name: "Engineer",
        display_title: null,
        icon: null,
        role_label: null,
        status: null,
        reports: [],
      },
      {
        id: "bot",
        kind: "agent",
        profile_id: null,
        agent_id: "a-1",
        display_name: "Bot",
        display_title: null,
        icon: null,
        role_label: null,
        status: null,
        reports: [],
      },
    ],
  },
];

describe("team-manager-picker", () => {
  it("flattens human nodes only", () => {
    expect(flattenHumanOrgNodes(tree).map((n) => n.org_node_id)).toEqual([
      "ceo",
      "eng",
    ]);
  });

  it("excludes self by profile id", () => {
    const options = buildManagerPickerOptions(tree, "p-eng");
    expect(options.map((o) => o.org_node_id)).toEqual(["ceo"]);
  });

  it("maps picker sentinel and org node ids", () => {
    expect(reportsToIdFromPickerValue(MANAGER_NONE)).toBeNull();
    expect(reportsToIdFromPickerValue("ceo")).toBe("ceo");
    expect(pickerValueFromReportsToId(null)).toBe(MANAGER_NONE);
    expect(pickerValueFromReportsToId("ceo")).toBe("ceo");
  });
});
