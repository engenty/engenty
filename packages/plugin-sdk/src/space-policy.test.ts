import { describe, expect, it } from "vitest";
import {
  isOperationSpacePolicy,
  MISSING_SPACE_POLICY_ALLOWLIST,
  operationSpacePolicySchema,
  recordScopeFromSpacePolicy,
  spacePlacedOperationsMissingPolicy,
} from "./space-policy.js";

describe("operationSpacePolicySchema", () => {
  it("accepts every declared kind", () => {
    expect(operationSpacePolicySchema.parse({ kind: "platform" })).toEqual({
      kind: "platform",
    });
    expect(operationSpacePolicySchema.parse({ kind: "tenant_shared" })).toEqual(
      { kind: "tenant_shared" }
    );
    expect(operationSpacePolicySchema.parse({ kind: "user_owned" })).toEqual({
      kind: "user_owned",
    });
    expect(
      operationSpacePolicySchema.parse({ kind: "account_mounted" })
    ).toEqual({ kind: "account_mounted" });
    expect(
      operationSpacePolicySchema.parse({
        kind: "space_owned",
        spaceInputKey: "space_id",
        record: { moduleId: "projects", idInputKey: "id" },
      })
    ).toMatchObject({ kind: "space_owned" });
  });

  it("rejects an unknown kind and a non-space_id collection key", () => {
    expect(isOperationSpacePolicy({ kind: "derived_space" })).toBe(false);
    expect(
      isOperationSpacePolicy({
        kind: "space_owned",
        spaceInputKey: "workspace_id",
      })
    ).toBe(false);
  });

  it("exposes record_scope as the policy kind without guessing", () => {
    expect(recordScopeFromSpacePolicy(undefined)).toBeUndefined();
    expect(recordScopeFromSpacePolicy({ kind: "tenant_shared" })).toBe(
      "tenant_shared"
    );
    expect(recordScopeFromSpacePolicy({ kind: "space_owned" })).toBe(
      "space_owned"
    );
    expect(
      recordScopeFromSpacePolicy({
        kind: "account_mounted",
        connectionInputKey: "account",
      })
    ).toBe("account_mounted");
  });
});

describe("spacePlacedOperationsMissingPolicy", () => {
  it("reports Space-placed operations that omit spacePolicy", () => {
    expect(
      spacePlacedOperationsMissingPolicy([
        {
          moduleId: "projects",
          operationId: "projects_list",
          pluginPlacement: "space",
        },
        {
          moduleId: "projects",
          operationId: "projects_create",
          pluginPlacement: "space",
          spacePolicy: { kind: "space_owned" },
        },
        {
          moduleId: "core",
          operationId: "core_ping",
          pluginPlacement: "global",
        },
      ])
    ).toEqual([{ moduleId: "projects", operationId: "projects_list" }]);
  });

  it("treats an omitted placement as space, matching DEFAULT_PLUGIN_PLACEMENT", () => {
    expect(
      spacePlacedOperationsMissingPolicy([
        { moduleId: "files", operationId: "space_file_list" },
      ])
    ).toEqual([{ moduleId: "files", operationId: "space_file_list" }]);
  });

  it("honours an explicit allowlist entry and keeps the shipped list empty", () => {
    expect(MISSING_SPACE_POLICY_ALLOWLIST).toEqual([]);
    expect(
      spacePlacedOperationsMissingPolicy(
        [{ moduleId: "projects", operationId: "projects_list" }],
        [
          {
            operationId: "projects_list",
            owner: "spaces-pkg4",
            removalTask: "package-9-projects",
          },
        ]
      )
    ).toEqual([]);
  });
});
