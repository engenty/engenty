import { describe, expect, it } from "vitest";
import type { Task, TaskRun } from "../../src/schema/types.js";
import {
  canContinueTaskFromUserComment,
  isTaskRunLiveActive,
  shouldPollTaskDetailLive,
  shouldStartContinuationRun,
} from "./task-run-live.js";

const baseRun: TaskRun = {
  agent_session_run_id: "run-a",
  created_at: "2026-05-01T00:00:00.000Z",
  id: "tr-1",
  role: "checkout",
  scope_id: "default",
  task_id: "task-1",
  tenant_id: "tenant-1",
};

const baseTask: Task = {
  blocked_by_task_ids: [],
  cancelled_at: null,
  checkout_run_id: "run-a",
  collaborator_user_ids: [],
  completed_at: null,
  created_at: "2026-05-01T00:00:00.000Z",
  created_by_agent_type_key: null,
  created_by_user_id: null,
  description: null,
  due_date: null,
  goal_id: null,
  id: "task-1",
  identifier: "ENG-1",
  parent_id: null,
  primary_assignee_agent_type_key: "tasks.assist",
  primary_assignee_kind: "agent",
  primary_assignee_user_id: null,
  priority: "medium",
  project_id: null,
  scope_id: "default",
  started_at: null,
  status: "in_progress",
  tenant_id: "tenant-1",
  title: "Sample",
  updated_at: "2026-05-01T00:00:00.000Z",
};

describe("isTaskRunLiveActive", () => {
  it("treats finished runs as inactive even when checkout still points at them", () => {
    expect(
      isTaskRunLiveActive({
        ...baseRun,
        run_finished_at: "2026-05-01T01:00:00.000Z",
      })
    ).toBe(false);
  });

  it("treats runs without finished_at as active", () => {
    expect(isTaskRunLiveActive({ ...baseRun, run_finished_at: null })).toBe(
      true
    );
  });
});

describe("shouldPollTaskDetailLive", () => {
  it("polls while checkout run is still open in cache", () => {
    expect(
      shouldPollTaskDetailLive({
        observerStreaming: false,
        runs: [{ ...baseRun, run_finished_at: null }],
        task: baseTask,
      })
    ).toBe(true);
  });

  it("stops polling when checkout run is finished", () => {
    expect(
      shouldPollTaskDetailLive({
        observerStreaming: false,
        runs: [
          {
            ...baseRun,
            run_finished_at: "2026-05-01T01:00:00.000Z",
          },
        ],
        task: baseTask,
      })
    ).toBe(false);
  });

  it("polls while observer is streaming", () => {
    expect(
      shouldPollTaskDetailLive({
        observerStreaming: true,
        runs: [],
        task: null,
      })
    ).toBe(true);
  });
});

describe("canContinueTaskFromUserComment", () => {
  it("allows continuation when agent holds checkout", () => {
    expect(
      canContinueTaskFromUserComment({
        runs: [baseRun],
        task: baseTask,
      })
    ).toBe(true);
  });

  it("skips when no checkout is held", () => {
    expect(
      canContinueTaskFromUserComment({
        runs: [],
        task: { ...baseTask, checkout_run_id: null },
      })
    ).toBe(false);
  });
});

describe("shouldStartContinuationRun", () => {
  it("starts a new run after terminal completion", () => {
    expect(shouldStartContinuationRun("succeeded")).toBe(true);
  });

  it("does not start while waiting for operator input", () => {
    expect(shouldStartContinuationRun("waiting_for_input")).toBe(false);
  });
});
