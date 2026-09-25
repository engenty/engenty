import { AG_UI_OPEN_INTERRUPT_METADATA_KEY } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  resolveSpaceHomeThreadState,
  type SpaceHomeRunInput,
  type SpaceHomeThreadInput,
} from "../ai/spaces/space-home-state.js";

const NOW = Date.parse("2026-09-09T08:00:00.000Z");
const SINCE = Date.parse("2026-09-09T06:00:00.000Z");

function thread(
  overrides: Partial<SpaceHomeThreadInput> = {}
): SpaceHomeThreadInput {
  return {
    agent_id: "coder",
    id: "t1",
    metadata: {},
    route_context: {},
    title: "Game Coder",
    updated_at: "2026-09-09T07:50:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<SpaceHomeRunInput> = {}): SpaceHomeRunInput {
  return {
    agent_id: "coder",
    finished_at: null,
    id: "r1",
    started_at: "2026-09-09T07:55:00.000Z",
    status: "running",
    thread_id: "t1",
    trigger: "message",
    ...overrides,
  };
}

function openInterrupt() {
  return {
    [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: {
      artifact_id: "a1",
      interrupt_id: "i1",
      kind: "decision",
      title: "deploy_board ausführen?",
      tool_call_id: "tc1",
      tool_name: "deploy_board",
    },
  };
}

// A conversation parked on a person must surface on the Space home, or the
// work stalls with nobody seeing the ask.
describe("resolveSpaceHomeThreadState — waiting on a person", () => {
  it("waits on an open interrupt", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread({ metadata: openInterrupt() }),
    });
    expect(state.state).toBe("waiting");
  });

  it("waits on an App that is built and not yet activated", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread({
        app_releases: [
          { app_id: "app-1", artifact_id: "art-1", name: "Reise", version: 4 },
        ],
      }),
    });
    expect(state.state).toBe("waiting");
  });
});

describe("resolveSpaceHomeThreadState — stale parked runs", () => {
  it("stops waiting once something later in the thread finished", () => {
    // `requires_action` is how a suspended run ends and is never cleared.
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [
        run({
          finished_at: "2026-09-09T07:30:00.000Z",
          id: "newer",
          started_at: "2026-09-09T07:20:00.000Z",
          status: "completed",
        }),
        run({
          finished_at: "2026-09-08T09:00:00.000Z",
          id: "older",
          started_at: "2026-09-08T08:00:00.000Z",
          status: "requires_action",
        }),
      ],
      sinceMs: SINCE,
      thread: thread(),
    });
    expect(state.state).not.toBe("waiting");
  });

  it("still waits when the ask is the newest thing there", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [
        run({ id: "ask", status: "requires_action" }),
        run({
          finished_at: "2026-09-09T06:30:00.000Z",
          id: "older",
          started_at: "2026-09-09T06:00:00.000Z",
          status: "completed",
        }),
      ],
      sinceMs: SINCE,
      thread: thread(),
    });
    expect(state.state).toBe("waiting");
  });
});
