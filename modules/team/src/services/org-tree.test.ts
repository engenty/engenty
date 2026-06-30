import { describe, expect, it } from "vitest";
import type { OrgNodeRow } from "../schema/taxonomies.js";
import { assertNoOrgCycle, resolveReportsToOrgNodeId } from "./org-tree.js";

const nodes: Pick<
  OrgNodeRow,
  "id" | "profile_id" | "node_kind" | "reports_to_id"
>[] = [
  {
    id: "node-ceo",
    profile_id: "profile-ceo",
    node_kind: "human",
    reports_to_id: null,
  },
  {
    id: "node-manager",
    profile_id: "profile-manager",
    node_kind: "human",
    reports_to_id: "node-ceo",
  },
  {
    id: "node-ic",
    profile_id: "profile-ic",
    node_kind: "human",
    reports_to_id: null,
  },
];

describe("resolveReportsToOrgNodeId", () => {
  it("accepts org node id", () => {
    expect(resolveReportsToOrgNodeId(nodes, "node-ceo")).toBe("node-ceo");
  });

  it("accepts manager profile id", () => {
    expect(resolveReportsToOrgNodeId(nodes, "profile-ceo")).toBe("node-ceo");
  });

  it("clears manager with null", () => {
    expect(resolveReportsToOrgNodeId(nodes, null)).toBeNull();
  });

  it("rejects unknown references", () => {
    expect(() => resolveReportsToOrgNodeId(nodes, "unknown")).toThrow(
      "reports_to_id must be the manager's org node id or profile id"
    );
  });
});

describe("assertNoOrgCycle", () => {
  it("rejects self-reporting", () => {
    expect(() => assertNoOrgCycle(nodes, "node-ic", "node-ic")).toThrow(
      "Org node cannot report to itself"
    );
  });

  it("rejects cycles", () => {
    expect(() => assertNoOrgCycle(nodes, "node-ceo", "node-manager")).toThrow(
      "Org cycle detected"
    );
  });
});
