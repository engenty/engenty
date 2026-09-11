import { describe, expect, it } from "vitest";
import { registerProjectsApi } from "./index.js";
import {
  PROJECTS_COLLECTION_SPACE_POLICY,
  PROJECTS_SETTINGS_SPACE_POLICY,
  projectsRecordSpacePolicy,
} from "./operation-space-policy.js";
import { makeMockApi, makeMockProjectRepo } from "./test-helpers.js";

const SPACE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("projects operation spacePolicy", () => {
  function policies() {
    const repo = makeMockProjectRepo();
    const { api, serverOperations } = makeMockApi();
    registerProjectsApi(api, repo);
    return new Map(
      serverOperations.map((operation) => [
        operation.operationId,
        operation.spacePolicy,
      ])
    );
  }

  it("declares a policy on every registered operation", () => {
    const declared = policies();
    expect([...declared.values()].every((policy) => policy != null)).toBe(true);
  });

  it("defaults list and create to collection space_owned so core injects current_space", () => {
    const declared = policies();
    expect(declared.get("projects_list")).toEqual(
      PROJECTS_COLLECTION_SPACE_POLICY
    );
    expect(declared.get("projects_create")).toEqual(
      PROJECTS_COLLECTION_SPACE_POLICY
    );
    expect(declared.get("projects_list_tasks")).toEqual(
      PROJECTS_COLLECTION_SPACE_POLICY
    );
    expect(declared.get("projects_task_counts")).toEqual(
      PROJECTS_COLLECTION_SPACE_POLICY
    );
  });

  it("list/create input schemas keep an injected space_id", () => {
    const repo = makeMockProjectRepo();
    const { api, serverOperations } = makeMockApi();
    registerProjectsApi(api, repo);
    const list = serverOperations.find(
      (operation) => operation.operationId === "projects_list"
    );
    const create = serverOperations.find(
      (operation) => operation.operationId === "projects_create"
    );
    expect(list?.inputSchema?.parse({ space_id: SPACE_A })).toMatchObject({
      space_id: SPACE_A,
    });
    expect(
      create?.inputSchema?.parse({
        client_id: null,
        space_id: SPACE_A,
        title: "Acme",
      })
    ).toMatchObject({ space_id: SPACE_A, title: "Acme" });
  });

  it("direct-record ops resolve Space from the project id and refuse a sibling Space at core", () => {
    const declared = policies();
    const projectRecord = projectsRecordSpacePolicy("id");
    const parentRecord = projectsRecordSpacePolicy("project_id");
    expect(declared.get("projects_get")).toEqual(projectRecord);
    expect(declared.get("projects_update")).toEqual(projectRecord);
    expect(declared.get("projects_delete")).toEqual(projectRecord);
    expect(declared.get("projects_create_phase")).toEqual(parentRecord);
    expect(declared.get("projects_update_phase")).toEqual(parentRecord);
    expect(declared.get("projects_delete_phase")).toEqual(parentRecord);
    expect(declared.get("projects_create_task")).toEqual(parentRecord);
    expect(declared.get("projects_create_tasks")).toEqual(parentRecord);
    expect(declared.get("projects_update_task")).toEqual(parentRecord);
    expect(declared.get("projects_delete_task")).toEqual(parentRecord);
    expect(declared.get("projects_update_visibility")).toEqual(parentRecord);
    expect(projectRecord.kind).toBe("space_owned");
    if (projectRecord.kind === "space_owned") {
      expect(projectRecord.record).toEqual({
        idInputKey: "id",
        moduleId: "projects",
      });
    }
  });

  it("classifies module settings as tenant_shared (no space_id to invent)", () => {
    const declared = policies();
    expect(declared.get("projects_settings_get")).toEqual(
      PROJECTS_SETTINGS_SPACE_POLICY
    );
    expect(declared.get("projects_settings_update")).toEqual(
      PROJECTS_SETTINGS_SPACE_POLICY
    );
  });
});
