import { describe, expect, it } from "vitest";
import { registerTasksGatewayMethods } from "./gateway-methods.js";
import {
  TASKS_COLLECTION_SPACE_POLICY,
  TASKS_SETTINGS_SPACE_POLICY,
  tasksRecordSpacePolicy,
} from "./operation-space-policy.js";
import { makeMockApi, makeMockTasksRepo } from "./test-helpers.js";

const SPACE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
  it("declares a policy on every registered operation", () => {
    const declared = allPolicies();
    expect(declared.size).toBeGreaterThan(0);
    expect([...declared.values()].every((policy) => policy != null)).toBe(true);
  });

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

  it("list/create input schemas keep an injected space_id", () => {
    const repo = makeMockTasksRepo();
    const { api, serverOperations } = makeMockApi();
    registerTasksGatewayMethods(api, repo);
    const list = serverOperations.find(
      (operation) => operation.operationId === "tasks_list"
    );
    const create = serverOperations.find(
      (operation) => operation.operationId === "tasks_create"
    );
    expect(list?.inputSchema?.parse({ space_id: SPACE_A })).toMatchObject({
      space_id: SPACE_A,
    });
    expect(
      create?.inputSchema?.parse({ space_id: SPACE_A, title: "Ship" })
    ).toMatchObject({ space_id: SPACE_A, title: "Ship" });
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
    expect(record.kind).toBe("space_owned");
    if (record.kind === "space_owned") {
      expect(record.record).toEqual({ idInputKey: "id", moduleId: "tasks" });
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
