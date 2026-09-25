import { keepPollingWhenHidden, staggerPollMs } from "@engenty/query-client";
import { describe, expect, it } from "vitest";
import { NOTIFICATIONS_BACKUP_POLL_MS } from "./queries.js";

describe("notification backup poll", () => {
  it("is slower than the old 30s tick now that realtime owns live updates", () => {
    expect(NOTIFICATIONS_BACKUP_POLL_MS).toBe(60_000);
  });

  it("staggers the list away from attention-count and space home", () => {
    expect(
      staggerPollMs(NOTIFICATIONS_BACKUP_POLL_MS, "notifications-list")
    ).not.toBe(
      staggerPollMs(NOTIFICATIONS_BACKUP_POLL_MS, "notifications-attention")
    );
    expect(
      staggerPollMs(NOTIFICATIONS_BACKUP_POLL_MS, "notifications-list")
    ).not.toBe(staggerPollMs(NOTIFICATIONS_BACKUP_POLL_MS, "space-home"));
  });

  it("does not poll a hidden browser tab", () => {
    expect(keepPollingWhenHidden()).toBe(false);
  });
});
