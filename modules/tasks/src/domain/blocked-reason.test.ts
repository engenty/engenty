import { describe, expect, it } from "vitest";
import { blockedReason } from "./blocked-reason.js";

describe("blockedReason", () => {
  it("returns approval when pending approval ops are set", () => {
    expect(
      blockedReason({
        blocked_by_task_ids: [],
        pending_approval_operation_ids: ["tasks_update"],
      })
    ).toBe("approval");
  });

  it("returns dependencies when blocker ids are set", () => {
    expect(
      blockedReason({
        blocked_by_task_ids: ["a", "b"],
        pending_approval_operation_ids: [],
      })
    ).toBe("dependencies");
  });

  it("returns failed when neither list is set", () => {
    expect(
      blockedReason({
        blocked_by_task_ids: [],
        pending_approval_operation_ids: [],
      })
    ).toBe("failed");
  });

  it("gives approval precedence when both lists are set", () => {
    expect(
      blockedReason({
        blocked_by_task_ids: ["a"],
        pending_approval_operation_ids: ["secrets_reveal"],
      })
    ).toBe("approval");
  });
});
