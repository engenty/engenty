import type { AGUIEvent } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { deriveTrajectoryGantt, ganttLaneFor } from "../run-trace-gantt.js";
import { buildInspectorTrajectory } from "../trajectory.js";

function events(list: Record<string, unknown>[]): AGUIEvent[] {
  return list as unknown as AGUIEvent[];
}

describe("ganttLaneFor", () => {
  it("splits system from user and maps recalled history by role", () => {
    expect(ganttLaneFor({ kind: "system" })).toBe(0);
    expect(ganttLaneFor({ kind: "context" })).toBe(0);
    expect(ganttLaneFor({ kind: "history", keyLabel: "signal" })).toBe(0);
    expect(ganttLaneFor({ kind: "user" })).toBe(1);
    expect(ganttLaneFor({ kind: "history", keyLabel: "user" })).toBe(1);
    expect(ganttLaneFor({ kind: "history", keyLabel: "human" })).toBe(1);
    expect(ganttLaneFor({ kind: "history", keyLabel: "agent" })).toBe(1);
    expect(ganttLaneFor({ kind: "assistant" })).toBe(2);
    expect(ganttLaneFor({ kind: "history", keyLabel: "assistant" })).toBe(2);
    expect(ganttLaneFor({ kind: "tool" })).toBe(3);
  });
});

describe("deriveTrajectoryGantt", () => {
  it("returns null for an empty ledger", () => {
    expect(deriveTrajectoryGantt([])).toBeNull();
  });

  it("puts system, user, model, and tools on separate lanes in sequence order", () => {
    const rows = buildInspectorTrajectory(
      events([
        { role: "user", type: "TEXT_MESSAGE_START" },
        {
          delta: "Fix the off-by-one bug in ports.py",
          type: "TEXT_MESSAGE_CONTENT",
        },
        { type: "TEXT_MESSAGE_END" },
        {
          name: "engenty.debug.initial_prompt",
          type: "CUSTOM",
          value: {
            recalledMessages: [
              {
                chars: 48,
                id: "11111111-1111-4111-8111-111111111111",
                preview: "Aktienkurse alle 10 Minuten",
                role: "user",
              },
              {
                chars: 120,
                id: "msg-2",
                preview: "DAX 24.102, +0.4%",
                role: "assistant",
              },
            ],
            runtimeContextInstructions: "Read-only: ports.py",
            systemInstructions: "You are a coding agent.",
            toolNames: ["read"],
          },
        },
        {
          toolCallId: "c1",
          toolCallName: "read",
          type: "TOOL_CALL_START",
        },
        { toolCallId: "c1", type: "TOOL_CALL_END" },
        { role: "assistant", type: "TEXT_MESSAGE_START" },
        {
          delta: "The range is off by one.",
          type: "TEXT_MESSAGE_CONTENT",
        },
        { type: "TEXT_MESSAGE_END" },
      ])
    );

    const model = deriveTrajectoryGantt(rows);
    expect(model).not.toBeNull();
    expect(model?.spans.map((span) => span.lane)).toEqual(
      rows.map((row) => ganttLaneFor(row))
    );
    expect(model?.spans.find((span) => span.kind === "system")?.lane).toBe(0);
    expect(
      model?.spans.find(
        (span) => span.kind === "history" && span.keyLabel === "user"
      )?.lane
    ).toBe(1);
    expect(
      model?.spans.find(
        (span) => span.kind === "history" && span.keyLabel === "assistant"
      )?.lane
    ).toBe(2);
    expect(model?.spans.find((span) => span.kind === "user")?.lane).toBe(1);
    expect(model?.spans.find((span) => span.kind === "assistant")?.lane).toBe(
      2
    );
    expect(model?.spans.find((span) => span.kind === "tool")?.lane).toBe(3);
    expect(model?.end).toBe(rows.length);
    expect(model?.turnBoundaries.some((boundary) => boundary.turn === 1)).toBe(
      true
    );
    expect(model?.sectionLabels.map((label) => label.label)).toEqual(
      expect.arrayContaining(["HISTORY", "TURN 1"])
    );
  });
});
