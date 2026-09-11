import { describe, expect, it } from "vitest";
import type { WorkflowDto } from "../workflow-canvas/workflow-api.js";
import { buildRoutineFlowOptions } from "./routine-flow-options.js";

function graph(overrides: Partial<WorkflowDto>): WorkflowDto {
  return {
    context_type: null,
    created_at: "2026-08-01T00:00:00.000Z",
    current_version: 3,
    description: null,
    id: "graph-id",
    module_id: null,
    name: "Flow",
    owner_agent_id: null,
    status: "active",
    title: null,
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRoutineFlowOptions", () => {
  it("offers only published, active graphs", () => {
    const options = buildRoutineFlowOptions([
      graph({ id: "g-1", name: "Runnable" }),
      graph({ id: "g-2", name: "Draft", status: "draft" }),
      graph({ current_version: null, id: "g-3", name: "Unpublished" }),
    ]);
    expect(options).toEqual([{ label: "Runnable (v3)", value: "g-1" }]);
  });

  it("prefers the stored title over the key name", () => {
    const options = buildRoutineFlowOptions([
      graph({
        id: "g-1",
        name: "contacts.research",
        title: "Research contact",
      }),
    ]);
    expect(options[0]?.label).toBe("Research contact (v3)");
  });

  it("sorts by label", () => {
    const options = buildRoutineFlowOptions([
      graph({ id: "g-b", name: "Beta" }),
      graph({ id: "g-a", name: "Alpha" }),
    ]);
    expect(options.map((option) => option.value)).toEqual(["g-a", "g-b"]);
  });
});
