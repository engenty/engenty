import { describe, expect, it } from "vitest";
import {
  applyEngentyAgUiConversationAction,
  type EngentyAgUiConversationState,
} from "./conversation.js";

function emptyConversation(): EngentyAgUiConversationState {
  return applyEngentyAgUiConversationAction(
    {
      activeTextMessageId: null,
      events: [],
      messages: [],
      state: {},
      status: "idle",
    },
    { type: "reset" }
  );
}

describe("AG-UI shared state snapshots", () => {
  it("stores STATE_SNAPSHOT on conversation shared state", () => {
    const snapshot = {
      observed_at: "2026-05-27T00:00:00.000Z",
      route: {
        module_id: "engenty-copilot",
        pathname: "/mdl/team/m1",
        route_key: "chat",
      },
      sequence: 3,
      shell: { copilot_open: true },
      snapshot_id: "snap-1",
      version: 1 as const,
    };
    const next = applyEngentyAgUiConversationAction(emptyConversation(), {
      type: "event",
      event: { type: "STATE_SNAPSHOT", snapshot },
    });
    expect(next.state).toEqual(snapshot);
  });

  it("pathname change mid-session: second STATE_SNAPSHOT replaces route from first", () => {
    const snap1 = {
      observed_at: "2026-05-27T00:00:00.000Z",
      route: {
        module_id: "contacts",
        pathname: "/mdl/contacts/c-1",
        route_key: "detail",
      },
      sequence: 1,
      shell: { copilot_open: true },
      snapshot_id: "snap-1",
      version: 1 as const,
    };
    const snap2 = {
      ...snap1,
      route: {
        module_id: "tasks",
        pathname: "/mdl/tasks/t-1",
        route_key: "detail",
      },
      sequence: 2,
      snapshot_id: "snap-2",
    };
    const afterFirst = applyEngentyAgUiConversationAction(emptyConversation(), {
      type: "event",
      event: { type: "STATE_SNAPSHOT", snapshot: snap1 },
    });
    const afterSecond = applyEngentyAgUiConversationAction(afterFirst, {
      type: "event",
      event: { type: "STATE_SNAPSHOT", snapshot: snap2 },
    });
    expect(afterSecond.state).toMatchObject({
      route: { module_id: "tasks", pathname: "/mdl/tasks/t-1" },
    });
  });
});
