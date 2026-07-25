import { describe, expect, it } from "vitest";
import { APP_BY_ID_PATH, registerAppsApi } from "./index.js";
import { makeFakeAppsRepo, makeFakeStore, makeMockApi } from "./test-helpers.js";

describe("registerAppsApi", () => {
  it("registers expected HTTP routes", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, httpRoutes } = makeMockApi();
    registerAppsApi(api, repo);

    const signatures = httpRoutes
      .map((route) => `${route.method.toUpperCase()} ${route.path}`)
      .sort();

    expect(signatures).toContain(`GET ${APP_BY_ID_PATH}/frontend`);
    expect(signatures).toContain(`GET ${APP_BY_ID_PATH}/versions`);
  });

  it("registers the exact app operation set", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const ids = serverOperations.map((op) => op.operationId).sort();
    expect(ids).toEqual([
      "app_actions_list",
      "app_archive",
      "app_call",
      "app_call_privileged",
      "app_create",
      "app_data_delete",
      "app_data_export",
      "app_data_get",
      "app_data_list",
      "app_data_set",
      "app_file_write",
      "app_get",
      "app_list",
      "app_release_approve",
      "app_release_propose",
      "app_release_reject",
      "app_release_rollback",
      "app_versions_list",
    ]);
  });

  it("gates activation on apps.approve, not on the module write capability", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    for (const id of [
      "app_release_approve",
      "app_release_reject",
      "app_release_rollback",
      "app_archive",
    ]) {
      expect(byId.get(id)?.requiredCapabilities).toEqual(["apps.approve"]);
      // The approval act must never itself require approval, or it deadlocks.
      expect(byId.get(id)?.requiresApproval).toBe(false);
    }
  });

  it("keeps app_call unprivileged and app_call_privileged approval-gated", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    expect(byId.get("app_call")?.requiresApproval).toBe(false);
    expect(byId.get("app_call")?.riskLevel).toBe("low");
    expect(byId.get("app_call_privileged")?.requiresApproval).toBe(true);
    expect(byId.get("app_call_privileged")?.riskLevel).toBe("high");
  });

  it("keeps authoring operations approval-gated", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    for (const id of ["app_create", "app_file_write", "app_release_propose"]) {
      expect(byId.get(id)?.requiresApproval).toBe(true);
      expect(byId.get(id)?.requiredCapabilities).toEqual([
        "module.engenty-apps.write",
      ]);
    }
  });

  it("leaves the app's own working store un-gated", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    for (const id of [
      "app_data_get",
      "app_data_list",
      "app_data_set",
      "app_data_delete",
    ]) {
      expect(byId.get(id)?.requiresApproval).toBe(false);
      expect(byId.get(id)?.riskLevel).toBe("low");
    }
    expect(byId.get("app_data_set")?.requiredCapabilities).toEqual([
      "module.engenty-apps.write",
    ]);
    expect(byId.get("app_data_get")?.requiredCapabilities).toEqual([
      "module.engenty-apps.read",
    ]);
  });
});
