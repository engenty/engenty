import { describe, expect, it, vi } from "vitest";

vi.mock("@engenty/api-client", () => ({
  requestApiEnvelope: vi.fn(),
  requestApiJson: vi.fn(),
}));

import { requestApiEnvelope, requestApiJson } from "@engenty/api-client";
import { getTaskActivity, getTaskRuns, getTasks } from "./api.js";

describe("tasks ui api", () => {
  it("maps paginated task list envelope into TasksPaginatedResponse", async () => {
    vi.mocked(requestApiEnvelope).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          tenant_id: "22222222-2222-4222-8222-222222222222",
          scope_id: "default",
          identifier: "ENG-1",
          title: "Erster Task",
          description: null,
          status: "todo",
          priority: "medium",
          parent_id: null,
          primary_assignee_kind: "none",
          primary_assignee_user_id: null,
          primary_assignee_agent_type_key: null,
          created_by_user_id: null,
          created_by_agent_type_key: null,
          due_date: null,
          started_at: null,
          completed_at: null,
          cancelled_at: null,
          checkout_run_id: null,
          created_at: "2026-05-22T12:00:00.000Z",
          updated_at: "2026-05-22T12:00:00.000Z",
        },
      ],
      meta: { page: 1, pageSize: 25, total: 1 },
    });

    const result = await getTasks({ page: 1, pageSize: 25 });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it("returns task activity array from unwrapped API envelope", async () => {
    const activity = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tenant_id: "22222222-2222-4222-8222-222222222222",
        scope_id: "default",
        task_id: "11111111-1111-4111-8111-111111111111",
        event_type: "tasks.status_changed",
        payload: { from: "todo", to: "in_progress" },
        actor_user_id: "33333333-3333-4333-8333-333333333333",
        actor_agent_type_key: null,
        created_at: "2026-05-22T12:00:00.000Z",
      },
    ];
    vi.mocked(requestApiJson).mockResolvedValue(activity);

    const result = await getTaskActivity(
      "11111111-1111-4111-8111-111111111111"
    );

    expect(requestApiJson).toHaveBeenCalledWith(
      "/api/tasks/11111111-1111-4111-8111-111111111111/activity",
      expect.objectContaining({ signal: undefined })
    );
    expect(result).toEqual(activity);
    expect(result).toHaveLength(1);
  });

  it("returns task runs array from unwrapped API envelope", async () => {
    const runs = [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        tenant_id: "22222222-2222-4222-8222-222222222222",
        scope_id: "default",
        task_id: "11111111-1111-4111-8111-111111111111",
        agent_session_run_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        agent_thread_id: null,
        agent_type_key: "tasks-assist",
        created_by_user_id: null,
        run_started_at: "2026-05-22T12:00:00.000Z",
        run_finished_at: null,
        checkout_run_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        created_at: "2026-05-22T12:00:00.000Z",
      },
    ];
    vi.mocked(requestApiJson).mockResolvedValue(runs);

    const result = await getTaskRuns("11111111-1111-4111-8111-111111111111");

    expect(requestApiJson).toHaveBeenCalledWith(
      "/api/tasks/11111111-1111-4111-8111-111111111111/runs",
      expect.objectContaining({ signal: undefined })
    );
    expect(result).toEqual(runs);
  });
});
