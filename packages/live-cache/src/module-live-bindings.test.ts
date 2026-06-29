import { describe, expect, it } from "vitest";
import {
  buildAgentToolInvalidationMap,
  type ModuleLiveBinding,
  toLiveCacheBindings,
} from "./module-live-bindings.js";

const projects: ModuleLiveBinding = {
  id: "projects",
  queryRoot: ["projects"],
  agentToolIds: ["manage_project", "manage_project_task"],
  postgresChanges: [{ schema: "module_projects", table: "projects" }],
};

const contacts: ModuleLiveBinding = {
  id: "contacts",
  queryRoot: ["contacts"],
  agentToolIds: ["manage_project"], // intentional overlap to test merge
};

describe("buildAgentToolInvalidationMap", () => {
  it("maps each tool id to its module's query root", () => {
    const map = buildAgentToolInvalidationMap([projects]);
    expect(map.get("manage_project")).toEqual([["projects"]]);
    expect(map.get("manage_project_task")).toEqual([["projects"]]);
  });

  it("merges roots when a tool id appears in multiple modules", () => {
    const map = buildAgentToolInvalidationMap([projects, contacts]);
    expect(map.get("manage_project")).toEqual([["projects"], ["contacts"]]);
  });

  it("ignores modules without agent tool ids", () => {
    const map = buildAgentToolInvalidationMap([{ id: "x", queryRoot: ["x"] }]);
    expect(map.size).toBe(0);
  });
});

describe("toLiveCacheBindings", () => {
  it("includes only modules that declare postgres changes", () => {
    const bindings = toLiveCacheBindings([projects, contacts]);
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.id).toBe("projects");
  });

  it("resolves the module query root for any signal", () => {
    const [binding] = toLiveCacheBindings([projects]);
    const keys = binding?.resolveQueryKeys(
      { tenantId: "t1" },
      {
        kind: "postgres_changes",
        schema: "module_projects",
        table: "projects",
      }
    );
    expect(keys).toEqual([["projects"]]);
  });
});
