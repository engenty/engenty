/**
 * Contract tests — written in Phase 0, must pass unchanged through Phase 7.
 *
 * These tests define platform behavior for tasks independent of storage.
 * Phase 7 adds projects integration tests that rely on the same contracts
 * via tasks operations + task_contexts links.
 */
import { describe, expect, it } from "vitest";
import {
  canTransitionTaskStatus,
  formatTaskIdentifier,
  isValidTaskIdentifier,
  normalizeTaskAssignees,
} from "../domain/task-lifecycle.js";

describe("task identifier contract", () => {
  it("formats prefix and sequence as ENG-142", () => {
    expect(formatTaskIdentifier("eng", 142)).toBe("ENG-142");
    expect(formatTaskIdentifier("ACME", 1)).toBe("ACME-1");
  });

  it("rejects invalid prefix or sequence", () => {
    expect(() => formatTaskIdentifier("", 1)).toThrow(
      "task_identifier_prefix_required"
    );
    expect(() => formatTaskIdentifier("ENG", 0)).toThrow(
      "task_identifier_sequence_invalid"
    );
  });

  it("validates identifier pattern", () => {
    expect(isValidTaskIdentifier("ENG-142")).toBe(true);
    expect(isValidTaskIdentifier("eng-142")).toBe(false);
    expect(isValidTaskIdentifier("ENG142")).toBe(false);
  });
});

describe("primary assignee + collaborators contract", () => {
  it("allows one primary user and distinct collaborators", () => {
    const result = normalizeTaskAssignees({
      primary_assignee_kind: "user",
      primary_assignee_user_id: "user-a",
      collaborator_user_ids: ["user-b", "user-c"],
    });
    expect(result.primary_assignee_kind).toBe("user");
    expect(result.primary_assignee_user_id).toBe("user-a");
    expect(result.collaborator_user_ids).toEqual(["user-b", "user-c"]);
  });

  it("dedupes primary from collaborators", () => {
    const result = normalizeTaskAssignees({
      primary_assignee_kind: "user",
      primary_assignee_user_id: "user-a",
      collaborator_user_ids: ["user-a", "user-b"],
    });
    expect(result.collaborator_user_ids).toEqual(["user-b"]);
  });

  it("supports agent primary assignee", () => {
    const result = normalizeTaskAssignees({
      primary_assignee_agent_type_key: "tasks.assist",
      primary_assignee_kind: "agent",
    });
    expect(result.primary_assignee_kind).toBe("agent");
    expect(result.primary_assignee_agent_type_key).toBe("tasks.assist");
  });
});

describe("task lifecycle contract", () => {
  it("allows reopening from terminal statuses", () => {
    expect(
      canTransitionTaskStatus({
        actorKind: "user",
        from: "done",
        to: "todo",
      })
    ).toBe(true);
    expect(
      canTransitionTaskStatus({
        actorKind: "user",
        from: "cancelled",
        to: "in_progress",
      })
    ).toBe(true);
  });

  it("requires agent checkout when reopening to in_progress", () => {
    expect(
      canTransitionTaskStatus({
        actorKind: "agent",
        from: "done",
        to: "in_progress",
        hasActiveCheckout: false,
      })
    ).toBe(false);
    expect(
      canTransitionTaskStatus({
        actorKind: "agent",
        from: "done",
        to: "in_progress",
        hasActiveCheckout: true,
      })
    ).toBe(true);
  });

  it("requires agent checkout before in_progress", () => {
    expect(
      canTransitionTaskStatus({
        actorKind: "agent",
        from: "todo",
        to: "in_progress",
        hasActiveCheckout: false,
      })
    ).toBe(false);
    expect(
      canTransitionTaskStatus({
        actorKind: "agent",
        from: "todo",
        to: "in_progress",
        hasActiveCheckout: true,
      })
    ).toBe(true);
  });

  it("allows human direct in_progress without checkout", () => {
    expect(
      canTransitionTaskStatus({
        actorKind: "user",
        from: "todo",
        to: "in_progress",
        hasActiveCheckout: false,
      })
    ).toBe(true);
  });
});

/**
 * Phase 7 projects integration scenarios live in
 * modules/projects/src/contracts/tasks-integration.contract.test.ts
 */
