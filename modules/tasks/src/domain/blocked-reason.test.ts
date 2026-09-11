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

  it("returns question when the caller knows one is open", () => {
    expect(
      blockedReason(
        { blocked_by_task_ids: [], pending_approval_operation_ids: [] },
        { hasOpenQuestion: true }
      )
    ).toBe("question");
  });

  it("still prefers a pending approval over an open question", () => {
    // Both can be true after a run that asked and then hit a gated tool; the
    // approval is the one with buttons that unblock the run.
    expect(
      blockedReason(
        {
          blocked_by_task_ids: [],
          pending_approval_operation_ids: ["contacts_contact_search"],
        },
        { hasOpenQuestion: true }
      )
    ).toBe("approval");
  });

  it("gives approval precedence when both lists are set", () => {
    expect(
      blockedReason({
        blocked_by_task_ids: ["a"],
        pending_approval_operation_ids: ["secrets_reveal"],
      })
    ).toBe("approval");
  });

  it("reads a parked flow gate as an approval, not a failure", () => {
    // A flow suspended at `approval_gate` has NO pending operation id — the
    // gate is a graph node, not a tool grant — so without the hint the badge
    // said "run failed" about a task that is merely waiting for a decision.
    expect(
      blockedReason(
        { blocked_by_task_ids: [], pending_approval_operation_ids: [] },
        { hasOpenFlowGate: true }
      )
    ).toBe("approval");
  });
});
