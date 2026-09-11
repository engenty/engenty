import { describe, expect, it } from "vitest";
import type { TaskDetail, TasksBriefingResponse } from "../src/schema/types.js";
import {
  buildBriefingSnapshot,
  buildTaskSnapshot,
  buildTasksPreview,
} from "./copilot-snapshot.js";

const baseTask: TaskDetail = {
  id: "task-1",
  tenant_id: "tenant-1",
  scope_id: "default",
  space_id: "space-1",
  identifier: "TSK-1",
  title: "Ship tasks module",
  description: "Build copilot integration",
  status: "in_progress",
  priority: "high",
  parent_id: null,
  primary_assignee_kind: "user",
  primary_assignee_user_id: "user-1",
  primary_assignee_agent_type_key: null,
  due_date: "2026-06-01",
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  checkout_run_id: null,
  blocked_by_task_ids: [],
  project_id: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-02T00:00:00.000Z",
  created_by_user_id: "user-1",
  created_by_agent_type_key: null,
  comments: [
    {
      id: "c1",
      tenant_id: "tenant-1",
      scope_id: "default",
      task_id: "task-1",
      content: "Started",
      created_by_user_id: "user-1",
      created_by_agent_type_key: null,
      created_at: "2026-05-02T00:00:00.000Z",
      kind: "note" as const,
      metadata: {},
    },
  ],
  contexts: [],
};

describe("buildTaskSnapshot", () => {
  it("returns compact task fields for copilot scope", () => {
    expect(buildTaskSnapshot(baseTask)).toEqual({
      identifier: "TSK-1",
      title: "Ship tasks module",
      status: "in_progress",
      priority: "high",
      description: "Build copilot integration",
      due_date: "2026-06-01",
      primary_assignee_kind: "user",
      primary_assignee_user_id: "user-1",
      primary_assignee_agent_type_key: null,
      checkout_run_id: null,
      comment_count: 1,
      recent_comments: [{ content: "Started" }],
    });
  });
});

describe("buildTasksPreview", () => {
  it("maps list tasks to preview rows", () => {
    expect(buildTasksPreview([baseTask])).toEqual([
      {
        id: "task-1",
        identifier: "TSK-1",
        title: "Ship tasks module",
        status: "in_progress",
        priority: "high",
      },
    ]);
  });
});

describe("buildBriefingSnapshot", () => {
  it("summarizes briefing sections with counts and capped tasks", () => {
    const briefing: TasksBriefingResponse = {
      mode: "personal",
      stale_after_days: 7,
      summary: {
        open: 1,
        in_progress: 1,
        blocked: 0,
        waiting: 0,
        stale: 0,
        attention: 0,
      },
      recent_tasks: [baseTask],
      recent_activity: [],
      focus_items: [{ reason: "due_soon", task: baseTask }],
      attention_items: [],
      waiting_items: [],
      stale_items: [],
    };

    expect(buildBriefingSnapshot(briefing)).toMatchObject({
      mode: "personal",
      stale_after_days: 7,
      focus_count: 1,
      attention_count: 0,
      waiting_count: 0,
      stale_count: 0,
      focus_tasks: [
        {
          id: "task-1",
          identifier: "TSK-1",
          title: "Ship tasks module",
        },
      ],
    });
  });
});
