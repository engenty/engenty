import { describe, expect, it } from "vitest";
import { NOTIFICATIONS_PATH, spaceInboxPath } from "./notification-paths.js";

describe("inbox paths", () => {
  it("keeps the tenant list at the shell root", () => {
    expect(NOTIFICATIONS_PATH).toBe("/notifications");
  });

  it("nests the space inbox under the space, encoded", () => {
    expect(spaceInboxPath("agent-test")).toBe("/s/agent-test/notifications");
    expect(spaceInboxPath("Sales / DACH")).toBe(
      "/s/Sales%20%2F%20DACH/notifications"
    );
  });
});
