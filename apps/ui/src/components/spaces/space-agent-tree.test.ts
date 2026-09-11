import { describe, expect, it } from "vitest";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";
import { buildSpaceAgentTree, isCoordinator } from "./space-agent-tree";

function agent(
  id: string,
  overrides: Partial<SpaceRosterAgent> = {}
): SpaceRosterAgent {
  return {
    engenty: "round",
    id,
    name: id,
    skillIds: [],
    source: "database",
    ...overrides,
  } as SpaceRosterAgent;
}

describe("space agent tree", () => {
  it("puts hired engenties with nobody above them at the top, reports underneath", () => {
    const tree = buildSpaceAgentTree([
      agent("tim", { reportsTo: "master" }),
      agent("master"),
      agent("tom", { reportsTo: "master" }),
      agent("scout", { reportsTo: "tim" }),
    ]);
    expect(tree.coordinators.map((node) => node.agent.id)).toEqual(["master"]);
    expect(tree.coordinators[0]?.reports.map((node) => node.agent.id)).toEqual([
      "tim",
      "tom",
    ]);
    expect(
      tree.coordinators[0]?.reports[0]?.reports.map((node) => node.agent.id)
    ).toEqual(["scout"]);
    expect(tree.fromApps).toEqual([]);
  });

  it("keeps app agents apart and treats a report whose manager left as a coordinator", () => {
    const tree = buildSpaceAgentTree([
      agent("inbox.assistant", { source: "module" }),
      agent("orphan", { reportsTo: "gone" }),
    ]);
    expect(tree.coordinators.map((node) => node.agent.id)).toEqual(["orphan"]);
    expect(tree.fromApps.map((row) => row.id)).toEqual(["inbox.assistant"]);
    expect(isCoordinator(agent("x", { source: "module" }), new Set())).toBe(
      false
    );
  });

  it("does not lose a cycle", () => {
    const tree = buildSpaceAgentTree([
      agent("a", { reportsTo: "b" }),
      agent("b", { reportsTo: "a" }),
    ]);
    const ids = tree.coordinators.flatMap((node) => [
      node.agent.id,
      ...node.reports.map((report) => report.agent.id),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});
