import { describe, expect, it } from "vitest";
import {
  formatAgentRelationTail,
  spaceAgentRelationsFromSurface,
} from "../runtime-space-block.js";

const names: Record<string, string> = {
  chief: "Chief of Staff",
  scout: "Scout",
  triage: "Inbox Triage",
};
const nameOf = (id: string) => names[id] ?? id;

describe("formatAgentRelationTail", () => {
  const relations = spaceAgentRelationsFromSurface({
    agentReportsTo: { scout: "chief", triage: "chief" },
    topLevelAgents: ["chief"],
  });

  it("names the manager of a report", () => {
    expect(formatAgentRelationTail("scout", relations, nameOf)).toBe(
      " [reports to Chief of Staff]"
    );
  });

  it("marks the coordinator and lists its reports by name", () => {
    expect(formatAgentRelationTail("chief", relations, nameOf)).toBe(
      " [coordinator — reports to nobody, may hire and set up; reports: Inbox Triage, Scout]"
    );
  });

  it("says nothing about an agent the Space does not place", () => {
    expect(formatAgentRelationTail("tasks.assist", relations, nameOf)).toBe("");
    expect(formatAgentRelationTail("scout", undefined, nameOf)).toBe("");
  });

  it("reads an older core without the fields as no relationships", () => {
    const empty = spaceAgentRelationsFromSurface({});
    expect(empty.reportsTo.size).toBe(0);
    expect(empty.topLevel.size).toBe(0);
  });
});
