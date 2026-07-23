import { describe, expect, it } from "vitest";
import { GOAL_BY_ID_PATH, registerTasksApi, TASK_BY_ID_PATH } from "./index.js";
import { makeMockApi, makeMockTasksRepo } from "./test-helpers.js";

describe("registerTasksApi", () => {
  it("registers expected HTTP routes in safe order", () => {
    const repo = makeMockTasksRepo();
    const { api, httpRoutes } = makeMockApi();
    registerTasksApi(api, repo);

    const routeSignatures = httpRoutes
      .map((r) => `${r.method.toUpperCase()} ${r.path}`)
      .sort();

    expect(routeSignatures).toContain("GET /api/tasks");
    expect(routeSignatures).toContain("GET /api/tasks/briefing");
    expect(routeSignatures).toContain("GET /api/tasks/settings");
    expect(routeSignatures).toContain("GET /api/tasks/goals");
    expect(routeSignatures).toContain(`GET ${TASK_BY_ID_PATH}`);
    expect(routeSignatures).toContain(`GET ${GOAL_BY_ID_PATH}`);
    expect(routeSignatures).toContain(`POST ${TASK_BY_ID_PATH}/checkout`);
    expect(routeSignatures).toContain(`POST ${TASK_BY_ID_PATH}/release`);
    expect(routeSignatures).toContain(`POST ${TASK_BY_ID_PATH}/tool-approvals`);
    expect(routeSignatures).toContain(`GET ${TASK_BY_ID_PATH}/runs`);
    expect(routeSignatures).toContain(`GET ${TASK_BY_ID_PATH}/activity`);
    expect(routeSignatures).toContain("POST /api/tasks");
    expect(routeSignatures).toContain("POST /api/tasks/goals");

    const settingsIndex = httpRoutes.findIndex(
      (r) => r.method === "get" && r.path === "/api/tasks/settings"
    );
    const taskByIdIndex = httpRoutes.findIndex(
      (r) => r.method === "get" && r.path === TASK_BY_ID_PATH
    );
    expect(settingsIndex).toBeGreaterThanOrEqual(0);
    expect(taskByIdIndex).toBeGreaterThanOrEqual(0);
    expect(settingsIndex).toBeLessThan(taskByIdIndex);
  });

  it("registers tasks and goals gateway operations", () => {
    const repo = makeMockTasksRepo();
    const { api, serverOperations } = makeMockApi();
    registerTasksApi(api, repo);

    const ids = serverOperations.map((o) => o.operationId).sort();
    expect(ids).toEqual([
      "goals_create",
      "goals_delete",
      "goals_get",
      "goals_handoff",
      "goals_list",
      "goals_update",
      "tasks_add_comment",
      "tasks_checkout",
      "tasks_clear_once_approvals",
      "tasks_create",
      "tasks_delete",
      "tasks_get",
      "tasks_list",
      "tasks_list_activity",
      "tasks_list_runs",
      "tasks_reap_stale_checkouts",
      "tasks_release",
      "tasks_resolve_tool_approval",
      "tasks_run_now",
      "tasks_settings_get",
      "tasks_settings_update",
      "tasks_update",
    ]);
  });
});
