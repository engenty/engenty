import { describe, expect, it } from "vitest";
import { registerTasksGatewayMethods } from "./gateway-methods.js";
import {
  TASKS_COLLECTION_SPACE_POLICY,
  TASKS_SETTINGS_SPACE_POLICY,
  tasksRecordSpacePolicy,
} from "./operation-space-policy.js";
import { makeMockApi, makeMockTasksRepo } from "./test-helpers.js";

function allPolicies() {
  const repo = makeMockTasksRepo();
  const { api, serverOperations } = makeMockApi();
  registerTasksGatewayMethods(api, repo);
  return new Map(
    serverOperations.map((operation) => [
      operation.operationId,
      operation.spacePolicy,
    ])
  );
}

describe("tasks operation spacePolicy", () => {
  it("defaults list and create to collection space_owned so core injects current_space", () => {
    const declared = allPolicies();
    for (const operationId of [
      "tasks_list",
      "tasks_create",
      "tasks_reap_stale_checkouts",
    ]) {
      expect(declared.get(operationId), operationId).toEqual(
        TASKS_COLLECTION_SPACE_POLICY
      );
    }
  });

  it("direct-record ops resolve Space from the row id for mismatch refusal", () => {
    const declared = allPolicies();
    const record = tasksRecordSpacePolicy("id");
    for (const operationId of [
      "tasks_get",
      "tasks_update",
      "tasks_delete",
      "tasks_checkout",
      "tasks_release",
      "tasks_run_now",
      "tasks_add_comment",
    ]) {
      expect(declared.get(operationId), operationId).toEqual(record);
    }
  });

  it("classifies module settings as tenant_shared (no space_id to invent)", () => {
    const declared = allPolicies();
    expect(declared.get("tasks_settings_get")).toEqual(
      TASKS_SETTINGS_SPACE_POLICY
    );
    expect(declared.get("tasks_settings_update")).toEqual(
      TASKS_SETTINGS_SPACE_POLICY
    );
  });
});
