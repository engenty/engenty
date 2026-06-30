import { describe, expect, it } from "vitest";
import { TEAM_MEMBERS_LIST_DISPLAY_DEFAULTS } from "./team-members-list-display.js";

describe("TEAM_MEMBERS_LIST_DISPLAY_DEFAULTS", () => {
  it("defaults to cards view", () => {
    expect(TEAM_MEMBERS_LIST_DISPLAY_DEFAULTS.viewMode).toBe("cards");
  });

  it("defaults to 25 items per page", () => {
    expect(TEAM_MEMBERS_LIST_DISPLAY_DEFAULTS.pageSize).toBe(25);
  });

  it("shows avatar column by default", () => {
    expect(TEAM_MEMBERS_LIST_DISPLAY_DEFAULTS.columnVisibility.avatar).toBe(
      true
    );
    expect(TEAM_MEMBERS_LIST_DISPLAY_DEFAULTS.columnOrder[0]).toBe("avatar");
  });
});
