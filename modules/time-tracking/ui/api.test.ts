import { describe, expect, it } from "vitest";
import { assertTimeTrackingContext } from "./api.js";

describe("time-tracking api", () => {
  it("rejects null context responses before the UI reads flags", () => {
    expect(() => assertTimeTrackingContext(null)).toThrow(
      "Time tracking context response is unavailable."
    );
  });

  it("accepts a complete context response", () => {
    expect(
      assertTimeTrackingContext({
        current_user: { id: "user-1", full_name: "User One" },
        is_admin: false,
        projects_available: false,
        tasks_available: true,
        team_available: true,
      })
    ).toEqual({
      current_user: { id: "user-1", full_name: "User One" },
      is_admin: false,
      projects_available: false,
      tasks_available: true,
      team_available: true,
    });
  });
});
