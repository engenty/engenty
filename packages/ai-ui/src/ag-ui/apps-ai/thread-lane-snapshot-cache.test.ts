import { afterEach, describe, expect, it } from "vitest";
import type { EngentyAgUiMessage } from "../conversation.js";
import {
  isThreadLaneInFlight,
  readThreadLaneSnapshot,
  resetThreadLaneSnapshotCacheForTests,
  saveThreadLaneSnapshot,
} from "./thread-lane-snapshot-cache.js";

const userMessage: EngentyAgUiMessage = {
  id: "user-1",
  role: "user",
  content: [{ type: "text", text: "hello" }],
};

describe("thread-lane-snapshot-cache", () => {
  afterEach(() => {
    resetThreadLaneSnapshotCacheForTests();
  });

  it("detects in-flight lane state", () => {
    expect(
      isThreadLaneInFlight({
        pendingSend: null,
        submitInFlight: false,
        submitStatus: "ready",
      })
    ).toBe(false);
    expect(
      isThreadLaneInFlight({
        pendingSend: { text: "hi", startedAt: 1, transcriptInsertIndex: 0 },
        submitInFlight: false,
        submitStatus: "ready",
      })
    ).toBe(true);
    expect(
      isThreadLaneInFlight({
        pendingSend: null,
        submitInFlight: false,
        submitStatus: "streaming",
      })
    ).toBe(true);
  });

  it("stores and restores snapshots for in-flight threads only", () => {
    saveThreadLaneSnapshot("thread-a", {
      messages: [userMessage],
      pendingSend: { text: "hello", startedAt: 1, transcriptInsertIndex: 0 },
      submitStatus: "streaming",
    });
    saveThreadLaneSnapshot("thread-b", {
      messages: [],
      pendingSend: null,
      submitStatus: "ready",
    });

    const restored = readThreadLaneSnapshot("thread-a");
    expect(restored?.messages).toEqual([userMessage]);
    expect(restored?.submitStatus).toBe("streaming");
    expect(readThreadLaneSnapshot("thread-b")).toBeNull();
  });
});
