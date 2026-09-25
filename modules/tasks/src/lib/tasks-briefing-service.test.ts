import { describe, expect, it } from "vitest";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import type { Task, TaskSettings } from "../schema/types.js";
import { definitionsToSettingsSlice } from "./task-status-settings.js";
import { buildTasksBriefingResponse } from "./tasks-briefing-service.js";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const settings: TaskSettings = {
  identifier_prefix: "ENG",
  stale_after_days: 7,
  ...definitionsToSettingsSlice(BUILTIN_TASK_STATUS_DEFINITIONS),
};

function makeTask(
  overrides: Partial<Task> & Pick<Task, "id" | "status">
): Task {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    tenant_id: "tenant",
    scope_id: "scope",
    space_id: overrides.space_id ?? "space-1",
    identifier: overrides.identifier ?? "ENG-1",
    title: overrides.title ?? "Task",
    description: null,
    status: overrides.status,
    priority: overrides.priority ?? "medium",
    parent_id: null,
    primary_assignee_kind: overrides.primary_assignee_kind ?? "none",
    primary_assignee_user_id: overrides.primary_assignee_user_id ?? null,
    primary_assignee_agent_type_key:
      overrides.primary_assignee_agent_type_key ?? null,
    created_by_user_id: null,
    created_by_agent_type_key: null,
    due_date: overrides.due_date ?? null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    blocked_by_task_ids: [],
    checkout_run_id: null,
    created_at: now,
    updated_at: overrides.updated_at ?? now,
    project_id: null,
  };
}

describe("buildTasksBriefingSnapshot", () => {
  describe("space scoping", () => {
    const SPACE = "11111111-1111-1111-1111-111111111111";

    function makeRepo() {
      const calls: Record<string, unknown>[] = [];
      const activityCalls: Record<string, unknown>[] = [];
      return {
        calls,
        activityCalls,
        repo: {
          getSettings: () => Promise.resolve(settings),
          listRecentActivity: (params: Record<string, unknown>) => {
            activityCalls.push(params);
            return Promise.resolve([]);
          },
          listTasksPaginated: (params: Record<string, unknown>) => {
            calls.push(params);
            return Promise.resolve({
              data: [makeTask({ id: "t1", status: "todo" })],
              page: 1,
              pageSize: 200,
              total: 1,
            });
          },
        },
      };
    }

    it("passes the space through to the task query", async () => {
      const { calls, repo } = makeRepo();
      await buildTasksBriefingResponse(repo as never, "oversight", undefined, {
        spaceId: SPACE,
      });
      expect(calls[0]?.space_id).toBe(SPACE);
    });

    it("narrows the oversight activity feed to the space's tasks", async () => {
      // Oversight normally asks for tenant-wide activity (taskIds undefined).
      // Inside a space that would show other spaces' work under this space's
      // heading — the one place where the space filter is easy to lose.
      const { activityCalls, repo } = makeRepo();
      await buildTasksBriefingResponse(repo as never, "oversight", undefined, {
        spaceId: SPACE,
      });
      expect(activityCalls[0]?.taskIds).toEqual(["t1"]);

      const tenantWide = makeRepo();
      await buildTasksBriefingResponse(
        tenantWide.repo as never,
        "oversight",
        undefined
      );
      expect(tenantWide.activityCalls[0]?.taskIds).toBeUndefined();
    });
  });
});
