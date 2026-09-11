// A flow's agents live inside mapping entries, not on the task row — this
// walker is what lets an agent's Plan surface claim a flow routine after
// promotion nulls the task-level agent column.
import { describe, expect, it } from "vitest";
import { collectFlowAgentKeys } from "../graph-agents.js";

const mapping = (config: Record<string, unknown>, id = "prepare") => ({
  id,
  mapConfig: JSON.stringify(config),
  type: "mapping",
});

describe("collectFlowAgentKeys", () => {
  it("reads the agent from a promoted one-node flow", () => {
    const graph = {
      graph: [
        mapping({
          agent_type_key: { value: "contacts.inbox-importer" },
          brief: { value: "Sort the inbox." },
        }),
        { id: "run", toolId: "run_specialist", type: "tool" },
      ],
      id: "promoted:x",
    };
    expect(collectFlowAgentKeys(graph)).toEqual(["contacts.inbox-importer"]);
  });

  it("walks container children and dedupes", () => {
    const graph = {
      graph: [
        mapping({ agent_type_key: { value: "a.one" } }),
        { id: "run1", toolId: "run_specialist", type: "tool" },
        {
          id: "cond",
          steps: [
            mapping({ agent_type_key: { value: "a.two" } }, "branch-map"),
            mapping({ agent_type_key: { value: "a.one" } }, "dupe-map"),
          ],
          type: "conditional",
        },
      ],
      id: "g",
    };
    expect(collectFlowAgentKeys(graph)).toEqual(["a.one", "a.two"]);
  });

  it("ignores mappings without an agent constant, and survives bad JSON", () => {
    const graph = {
      graph: [
        mapping({ brief: { value: "no agent here" } }),
        { id: "broken", mapConfig: "{not json", type: "mapping" },
        // A path-sourced agent key is not a constant — unresolvable statically.
        mapping({ agent_type_key: { initData: true, path: "agent" } }, "p"),
      ],
      id: "g",
    };
    expect(collectFlowAgentKeys(graph)).toEqual([]);
  });

  it("answers empty on a missing or entry-less graph", () => {
    expect(collectFlowAgentKeys(null)).toEqual([]);
    expect(collectFlowAgentKeys({ id: "g" })).toEqual([]);
  });
});
