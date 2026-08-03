import { describe, expect, it } from "vitest";

import { buildGoalGrantRow } from "./reveal-routes.js";

const INPUT = {
  capability: "secrets.read:s1",
  goalId: "goal-1",
  grantedBy: "user-1",
  tenantId: "tenant-a",
};

describe("buildGoalGrantRow", () => {
  it("never mints an unbounded secret grant", () => {
    const now = Date.parse("2026-08-03T12:00:00.000Z");
    const row = buildGoalGrantRow({ ...INPUT, now });

    // Nothing reaps goal grants when a goal ends, so an absent expiry means a
    // single in-chat "yes" authorizes every future agent on that goal forever.
    expect(row.expires_at).toBeTruthy();
    expect(Date.parse(row.expires_at)).toBeGreaterThan(now);
  });

  it("grants to any agent on the goal, not one in particular", () => {
    // canReadSecret's goal branch treats a null agent_id as "any agent on this
    // goal" — an agent-specific row would not match the next agent the
    // conversation hands off to.
    expect(buildGoalGrantRow(INPUT).agent_id).toBeNull();
  });

  it("carries the capability, goal and approver the reveal was gated on", () => {
    expect(buildGoalGrantRow(INPUT)).toMatchObject({
      capability: "secrets.read:s1",
      goal_id: "goal-1",
      granted_by: "user-1",
      tenant_id: "tenant-a",
    });
  });
});
