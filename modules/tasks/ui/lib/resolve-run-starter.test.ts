import { describe, expect, it } from "vitest";
import type { TaskActivity } from "../../src/schema/types.js";
import { resolveRunStarterLabel } from "./resolve-run-starter.js";

function activity(
  overrides: Partial<TaskActivity> & Pick<TaskActivity, "event_type">
): TaskActivity {
  return {
    actor_agent_type_key: null,
    actor_user_id: null,
    created_at: "2026-05-22T12:00:00.000Z",
    id: "act-1",
    payload: {},
    scope_id: "scope",
    task_id: "task-1",
    tenant_id: "tenant",
    ...overrides,
  };
}

describe("resolveRunStarterLabel", () => {
  it("returns profile name for matching checkout activity", () => {
    const profiles = new Map([
      ["user-1", { id: "user-1", full_name: "Jane Doe" }],
    ]);
    const label = resolveRunStarterLabel(
      "run-1",
      [
        activity({
          event_type: "tasks.checked_out",
          actor_user_id: "user-1",
          payload: { run_id: "run-1" },
        }),
      ],
      profiles
    );
    expect(label).toBe("Jane Doe");
  });

  it("returns null when no matching checkout", () => {
    expect(resolveRunStarterLabel("run-1", [], undefined)).toBeNull();
  });
});
