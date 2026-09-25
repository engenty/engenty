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
  it("draws wake source, steps, then the desk post when nothing else is delivered", () => {
    const model = routineShapeToCanvas(baseShape(), { locale: "de" });
    expect(model.nodes.map((node) => node.type)).toEqual([
      "trigger",
      "step",
      "delivery",
    ]);
    expect(model.nodes[2]?.data).toMatchObject({
      title: "Karte am Schreibtisch",
    });
    expect(model.edges).toEqual([
      expect.objectContaining({
        source: "trigger:r0",
        target: "agent",
        targetHandle: "side-in",
      }),
      expect.objectContaining({
        source: "agent",
        sourceHandle: "loop-out",
        target: "delivery:report",
      }),
    ]);
  });

  it("gives every delivery its own box with its description, fed by the last step", () => {
    const shape = baseShape();
    shape.outcome = {
      bindings: [
        {
          description: "Zusammenfassung an das Vertriebsteam",
          enabled: true,
          id: "o1",
          label: "E-Mail",
          mode: "always",
          modeLabel: "Jeder Lauf",
        },
        {
          description: null,
          enabled: true,
          id: "o2",
          label: "Update mit Priorität",
          mode: "always",
          modeLabel: "Jeder Lauf",
        },
      ],
      holdLine: null,
      report: "desk_card",
    };
    const model = routineShapeToCanvas(shape, { locale: "de" });
    const boxes = model.nodes.filter((node) => node.type === "delivery");
    expect(boxes.map((box) => box.data.title)).toEqual([
      "E-Mail",
      "Update mit Priorität",
    ]);
    expect(boxes[0]?.data.description).toBe(
      "Zusammenfassung an das Vertriebsteam"
    );
    // Each box hangs off the last step; none of them is the goal text.
    expect(
      model.edges.filter((edge) => edge.source === "agent").map((e) => e.target)
    ).toEqual(["delivery:o1", "delivery:o2"]);
    // Stacked, not overlapping.
    expect((boxes[0]?.position.y ?? 0) < (boxes[1]?.position.y ?? 0)).toBe(
      true
    );
  });

  it("lays the three bands out left to right", () => {
    const model = routineShapeToCanvas(baseShape());
    const [trigger, agent, delivery] = model.nodes;
    expect((trigger?.position.x ?? 0) < (agent?.position.x ?? 0)).toBe(true);
    expect((agent?.position.x ?? 0) < (delivery?.position.x ?? 0)).toBe(true);
  });
});
