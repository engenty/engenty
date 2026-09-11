import { describe, expect, it } from "vitest";
import { deriveSessionGantt, nestSessionTurns } from "../session-gantt.js";
import type { TrajectoryRow } from "../trajectory.js";

function row(
  over: Partial<TrajectoryRow> & Pick<TrajectoryRow, "kind">
): TrajectoryRow {
  return {
    detail: over.detail ?? over.text ?? over.kind,
    id: over.id ?? `${over.kind}-1`,
    keyLabel: over.keyLabel ?? null,
    kind: over.kind,
    result: over.result ?? null,
    resultDetail: over.resultDetail ?? null,
    sourceMessageId: over.sourceMessageId ?? null,
    text: over.text ?? over.kind,
    turn: over.turn ?? 1,
    turnStart: over.turnStart ?? false,
  };
}

describe("nestSessionTurns", () => {
  it("indents children under the parent run, not the flat list", () => {
    const nested = nestSessionTurns(
      [
        { id: "run-1", parent_run_id: null },
        { id: "run-2", parent_run_id: null },
      ],
      [{ id: "child-1", parent_run_id: "run-1" }]
    );
    expect(nested).toHaveLength(2);
    expect(nested[0]?.children.map((node) => node.run.id)).toEqual(["child-1"]);
    expect(nested[1]?.children).toEqual([]);
  });
});

describe("deriveSessionGantt", () => {
  it("returns null for an empty session", () => {
    expect(deriveSessionGantt([])).toBeNull();
  });

  it("places turns on wall-clock, ghosts history, and links recalled ids", () => {
    const model = deriveSessionGantt(
      [
        {
          run: {
            finished_at: "2026-08-27T12:00:02.000Z",
            id: "run-1",
            started_at: "2026-08-27T12:00:00.000Z",
          },
          rows: [
            row({
              kind: "user",
              id: "user-live",
              sourceMessageId: "msg-user",
              text: "hello",
            }),
            row({ kind: "assistant", id: "asst-live", text: "hi" }),
          ],
        },
        {
          children: [
            {
              run: {
                finished_at: "2026-08-27T12:00:07.000Z",
                id: "child-1",
                started_at: "2026-08-27T12:00:05.000Z",
              },
              rows: [row({ kind: "assistant", id: "child-asst", text: "ok" })],
            },
          ],
          run: {
            finished_at: "2026-08-27T12:00:08.000Z",
            id: "run-2",
            started_at: "2026-08-27T12:00:04.000Z",
          },
          rows: [
            row({
              kind: "history",
              id: "hist-1",
              keyLabel: "human",
              sourceMessageId: "msg-user",
              text: "hello",
            }),
            row({ kind: "user", id: "user-2", text: "again" }),
          ],
        },
      ],
      Date.parse("2026-08-27T12:00:10.000Z")
    );
    expect(model).not.toBeNull();
    expect(model?.startMs).toBe(Date.parse("2026-08-27T12:00:00.000Z"));
    expect(model?.endMs).toBe(Date.parse("2026-08-27T12:00:08.000Z"));
    expect(model?.bands).toHaveLength(2);
    expect(model?.bands[1]?.children).toHaveLength(1);
    const ghost = model?.bands[1]?.spans.find((span) => span.id === "hist-1");
    expect(ghost?.ghost).toBe(true);
    expect(ghost?.sourceRunId).toBe("run-1");
    const live = model?.bands[0]?.spans.find((span) => span.id === "user-live");
    expect(live?.ghost).toBe(false);
    expect(live?.sourceRunId).toBeNull();
  });
});
