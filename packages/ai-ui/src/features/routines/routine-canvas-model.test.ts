// The canvas rendering of the routine shape: three bands, ids passed through.
import { describe, expect, it } from "vitest";
import { routineShapeToCanvas } from "./routine-canvas-model.js";
import type { RoutineShape } from "./routine-shape.js";

function baseShape(): RoutineShape {
  return {
    middle: {
      workflowId: "action-1",
      pending: false,
      steps: [
        {
          chip: null,
          id: "agent",
          kind: "agent",
          subtitle: "Sort the inbox.",
          title: "contacts.inbox-importer",
        },
      ],
    },
    outcome: {
      bindings: [],
      holdLine: null,
      report: "desk_card",
      text: "Inbox is empty.",
    },
    triggers: [
      {
        detail: "Every day at 07:00",
        enabled: true,
        id: "r0",
        kind: "schedule",
        label: "Schedule",
      },
    ],
  };
}

describe("routineShapeToCanvas", () => {
  it("draws a one-step middle between wake source and outcome", () => {
    const model = routineShapeToCanvas(baseShape());
    expect(model.nodes.map((node) => node.type)).toEqual([
      "trigger",
      "step",
      "outcome",
    ]);
    // trigger → agent (into the side), agent → outcome (out the side).
    expect(model.edges).toEqual([
      expect.objectContaining({
        source: "trigger:r0",
        target: "agent",
        targetHandle: "side-in",
      }),
      expect.objectContaining({
        source: "agent",
        sourceHandle: "loop-out",
        target: "outcome",
      }),
    ]);
  });

  it("fans every wake source into the first step", () => {
    const shape = baseShape();
    shape.triggers.push({
      detail: null,
      enabled: true,
      id: "r1",
      kind: "manual",
      label: "Manual",
    });
    const model = routineShapeToCanvas(shape);
    expect(model.nodes.filter((node) => node.type === "trigger")).toHaveLength(
      2
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: "trigger:r1", target: "agent" })
    );
  });

  it("passes Action-spine ids through untouched, joined top to bottom", () => {
    const shape: RoutineShape = {
      ...baseShape(),
      middle: {
        workflowId: "action-1",
        pending: false,
        steps: [
          { chip: null, id: "run", kind: "agent", subtitle: null, title: "A" },
          { chip: null, id: "gate1", kind: "gate", subtitle: null, title: "G" },
        ],
      },
    };
    const model = routineShapeToCanvas(shape);
    // The stored graph's own entry ids ARE the node ids — a later run overlay
    // keyed on entry ids lands on these nodes without any mapping table.
    expect(
      model.nodes.filter((node) => node.type === "step").map((node) => node.id)
    ).toEqual(["run", "gate1"]);
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: "run", target: "gate1" })
    );
    // The outcome hangs off the LAST step.
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: "gate1", target: "outcome" })
    );
  });

  it("bridges an empty published Workflow with a placeholder step", () => {
    const shape: RoutineShape = {
      ...baseShape(),
      middle: {
        workflowId: "action-1",
        pending: false,
        steps: [],
      },
    };
    const model = routineShapeToCanvas(shape);
    const middle = model.nodes.filter((node) => node.type === "step");
    expect(middle).toHaveLength(1);
    expect(middle[0]?.id).toBe("empty");
    // Still a connected picture: trigger → placeholder → outcome.
    expect(model.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(
      ["trigger:r0->empty", "empty->outcome"]
    );
  });

  it("lays the three bands out left to right", () => {
    const model = routineShapeToCanvas(baseShape());
    const [trigger, agent, outcome] = model.nodes;
    expect(trigger && agent && outcome).toBeTruthy();
    expect((trigger?.position.x ?? 0) < (agent?.position.x ?? 0)).toBe(true);
    expect((agent?.position.x ?? 0) < (outcome?.position.x ?? 0)).toBe(true);
  });

  it("lists destination bindings on the outcome node instead of the desk-post line", () => {
    const shape = baseShape();
    shape.outcome = {
      bindings: [
        {
          enabled: true,
          id: "o1",
          label: "High-priority update",
          mode: "agent",
          modeLabel: "When the run calls it",
        },
      ],
      holdLine: "Holds the run for review",
      report: "ask",
      text: "Inbox is empty.",
    };
    const model = routineShapeToCanvas(shape);
    const node = model.nodes.find((entry) => entry.type === "outcome");
    expect(node?.data).toMatchObject({
      bindings: [
        {
          enabled: true,
          id: "o1",
          label: "High-priority update",
          modeLabel: "When the run calls it",
        },
      ],
      holdLine: "Holds the run for review",
      reportLine: null,
    });
  });
});
