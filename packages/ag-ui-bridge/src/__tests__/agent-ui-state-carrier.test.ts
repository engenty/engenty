// Where the UI state snapshot rides on the wire.
//
// NEVER `RunAgentInput.state`. That is AG-UI's SHARED, DURABLE state:
// `@ag-ui/mastra` merges it into Mastra working memory before every run,
// unconditionally, with no opt-out. Our snapshot is transient UI context — route,
// selection, whether the copilot is open — so writing it into an agent's long-term
// memory each turn is wrong on its own terms, and would corrupt data outright if the
// backend driver ever became `@ag-ui/mastra`.
//
// These tests pin the carrier so it cannot drift back.
import { describe, expect, it } from "vitest";
import {
  type AgentUiStateSnapshotV1,
  agentUiStateForwardedProps,
  readAgentUiStateSnapshot,
} from "../agent-ui-state.js";

const snapshot: AgentUiStateSnapshotV1 = {
  observed_at: "2026-08-26T00:00:00.000Z",
  route: {
    module_id: "time-tracking",
    pathname: "/mdl/time-tracking/reports",
    route_key: "reports",
  },
  sequence: 1,
  shell: { copilot_open: true },
  snapshot_id: "snap-1",
  version: 1,
};

describe("agent UI state carrier", () => {
  it("round-trips through forwardedProps.engenty.ui_state", () => {
    const forwardedProps = { engenty: agentUiStateForwardedProps(snapshot) };
    expect(forwardedProps.engenty.ui_state).toBe(snapshot);
    expect(readAgentUiStateSnapshot(forwardedProps)).toEqual(snapshot);
  });

  it("contributes no key when there is no snapshot", () => {
    // An absent snapshot must not leave `ui_state: undefined` on the wire.
    expect(agentUiStateForwardedProps(undefined)).toEqual({});
    expect(Object.keys(agentUiStateForwardedProps(undefined))).toEqual([]);
  });

  it("does NOT read a snapshot parked on RunAgentInput.state", () => {
    // The old location, hard-cut. If this ever passes a snapshot back, the
    // working-memory hazard is live again.
    expect(readAgentUiStateSnapshot({ engenty: {} })).toBeUndefined();
    expect(readAgentUiStateSnapshot(snapshot)).toBeUndefined();
  });

  it("rejects a malformed snapshot rather than passing it through", () => {
    expect(
      readAgentUiStateSnapshot({ engenty: { ui_state: { version: 2 } } })
    ).toBeUndefined();
    expect(
      readAgentUiStateSnapshot({ engenty: { ui_state: "not-an-object" } })
    ).toBeUndefined();
  });

  it("tolerates missing or non-object forwardedProps", () => {
    for (const value of [undefined, null, "x", 42, {}, { engenty: null }]) {
      expect(readAgentUiStateSnapshot(value)).toBeUndefined();
    }
  });
});
