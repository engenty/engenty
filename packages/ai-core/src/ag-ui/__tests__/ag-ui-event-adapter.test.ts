import { EventSchemas } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  frontendToolCallToAgUiEvents,
  frontendToolResultToAgUiEvent,
  runtimeProgressToAgUiEvent,
  stateDeltaToAgUiEvent,
  stateSnapshotToAgUiEvent,
} from "../ag-ui-event-adapter.js";

describe("AG-UI event adapter", () => {
  it("maps runtime lifecycle events", () => {
    expect(
      runtimeProgressToAgUiEvent(
        { run_id: "run-1", type: "run.started" },
        { threadId: "thread-1" }
      )
    ).toEqual({ runId: "run-1", threadId: "thread-1", type: "RUN_STARTED" });
    expect(
      runtimeProgressToAgUiEvent({
        agent_id: "contacts.manager",
        confidence: 1,
        reason: "requested",
        type: "coordinator.decision",
      })
    ).toMatchObject({
      name: "engenty.coordinator.decision",
      type: "CUSTOM",
    });
  });

  it("maps snapshots, deltas, and frontend tool events", () => {
    const snapshotEvent = stateSnapshotToAgUiEvent({
      observed_at: "2026-05-03T19:50:00.000Z",
      route: {
        module_id: "contacts",
        pathname: "/mdl/contacts/1",
        route_key: "edit",
      },
      sequence: 1,
      shell: { copilot_open: true },
      snapshot_id: "snapshot-1",
      version: 1,
    });
    expect(snapshotEvent).toMatchObject({ type: "STATE_SNAPSHOT" });
    expect(EventSchemas.parse(snapshotEvent)).toEqual(snapshotEvent);
    const deltaEvent = stateDeltaToAgUiEvent({
      base_sequence: 1,
      delta_id: "delta-1",
      next_sequence: 2,
      operations: [
        { op: "replace", path: "/shell/copilot_open", value: false },
      ],
      snapshot_id: "snapshot-1",
      version: 1,
    });
    expect(deltaEvent).toEqual({
      delta: [{ op: "replace", path: "/shell/copilot_open", value: false }],
      type: "STATE_DELTA",
    });
    expect(EventSchemas.parse(deltaEvent)).toEqual(deltaEvent);
    const frontendToolEvents = frontendToolCallToAgUiEvents({
      call_id: "call-1",
      input: { to: "/mdl/contacts" },
      run_id: "run-1",
      tool_name: "navigate",
    });
    expect(frontendToolEvents).toEqual([
      {
        type: "TOOL_CALL_START",
        toolCallId: "call-1",
        toolCallName: "navigate",
      },
      {
        type: "TOOL_CALL_ARGS",
        toolCallId: "call-1",
        delta: '{"to":"/mdl/contacts"}',
      },
      {
        type: "TOOL_CALL_END",
        toolCallId: "call-1",
      },
    ]);
    expect(
      frontendToolResultToAgUiEvent({
        call_id: "call-1",
        output: { ok: true },
        run_id: "run-1",
        tool_name: "navigate",
      })
    ).toMatchObject({
      content: expect.any(String),
      toolCallId: "call-1",
      type: "TOOL_CALL_RESULT",
    });
  });
});
