import { staggerPollMs } from "@engenty/query-client";
import { describe, expect, it } from "vitest";
import {
  SPACE_HOME_IDLE_POLL_MS,
  SPACE_HOME_LIVE_POLL_MS,
  type SpaceHomeResponse,
  spaceHomeIsLive,
  spaceHomePollMs,
} from "./space-home-api.js";

function home(states: SpaceHomeResponse["threads"][number]["state"][]) {
  return {
    cursor: "c",
    threads: states.map((state, index) => ({
      agent_id: "a",
      agent_turns: 0,
      awaiting_first_reply: false,
      jobs: [],
      kind: "desk" as const,
      last_message: null,
      paused: false,
      state,
      thread_id: `t${index}`,
      title: null,
      updated_at: "2026-09-22T00:00:00.000Z",
    })),
  } satisfies SpaceHomeResponse;
}

describe("spaceHomePollMs", () => {
  it("follows live threads on the short cadence, staggered", () => {
    expect(spaceHomeIsLive(home(["running"]))).toBe(true);
    expect(spaceHomeIsLive(home(["waiting", "quiet"]))).toBe(true);
    expect(spaceHomePollMs(home(["running"]))).toBe(
      staggerPollMs(SPACE_HOME_LIVE_POLL_MS, "space-home")
    );
  });

  it("idles when nothing is moving, staggered off the notifications tick", () => {
    expect(spaceHomeIsLive(home(["quiet", "done"]))).toBe(false);
    expect(spaceHomePollMs(home(["quiet"]))).toBe(
      staggerPollMs(SPACE_HOME_IDLE_POLL_MS, "space-home")
    );
    expect(spaceHomePollMs(home(["quiet"]))).not.toBe(
      staggerPollMs(SPACE_HOME_IDLE_POLL_MS, "notifications-list")
    );
  });
});
