import { staggerPollMs } from "@engenty/query-client";
import { describe, expect, it } from "vitest";
import {
  ROOM_STATE_POLL_MS,
  SPACE_CONVERSATIONS_POLL_MS,
} from "./conversation-api.js";

describe("conversation poll cadence", () => {
  it("backs the rooms list off the old 15s tick and staggers it", () => {
    expect(SPACE_CONVERSATIONS_POLL_MS).toBeGreaterThanOrEqual(60_000);
    expect(SPACE_CONVERSATIONS_POLL_MS).toBe(
      staggerPollMs(60_000, "space-conversations")
    );
  });

  it("does not share a tick with space home or notifications", () => {
    expect(SPACE_CONVERSATIONS_POLL_MS).not.toBe(
      staggerPollMs(60_000, "space-home")
    );
    expect(SPACE_CONVERSATIONS_POLL_MS).not.toBe(
      staggerPollMs(60_000, "notifications-list")
    );
    expect(ROOM_STATE_POLL_MS).not.toBe(SPACE_CONVERSATIONS_POLL_MS);
  });
});
