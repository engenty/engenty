import { describe, expect, it } from "vitest";
import {
  collectEnabledDependents,
  type PluginDependencyNode,
} from "./plugin-dependents";

function node(
  partial: Partial<PluginDependencyNode> & Pick<PluginDependencyNode, "id">
): PluginDependencyNode {
  return {
    enabled: true,
    mandatory: false,
    name: partial.id,
    provides: [`module.${partial.id}`],
    requires: [],
    ...partial,
  };
}

describe("collectEnabledDependents", () => {
  it("returns plugins that require the target, dependents first", () => {
    const plugins = [
      node({ id: "tasks" }),
      node({ id: "projects", requires: ["module.tasks"] }),
      node({ id: "coordinator", requires: ["module.tasks"] }),
      node({ id: "offers", requires: ["module.projects"] }),
    ];

    // Deepest dependents first (safe cascade order). Sibling order follows
    // discovery over the plugins array.
    expect(collectEnabledDependents("tasks", plugins).map((p) => p.id)).toEqual(
      ["offers", "coordinator", "projects"]
    );
  });

  it("ignores disabled and unrelated plugins", () => {
    const plugins = [
      node({ id: "tasks" }),
      node({ id: "projects", requires: ["module.tasks"], enabled: false }),
      node({ id: "contacts", requires: ["module.team"] }),
    ];

    expect(collectEnabledDependents("tasks", plugins)).toEqual([]);
  });
});
