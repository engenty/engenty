import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import { isPluginOperationError } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { makeEmptyRegistry } from "../../../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../../../security/audit-adapter.js";
import type { PrincipalContext } from "../../../security/auth.js";
import {
  InvokeOperationError,
  invokeOperation,
} from "./module-operation-routes.js";
import {
  enforceOperationSpacePolicy,
  prepareOperationSpaceInput,
} from "./module-operation-space-policy.js";

const SPACE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SPACE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TENANT = "tenant-1";
const PROJECT_B = "project-b";

async function expectCode(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(isPluginOperationError(error)).toBe(true);
    if (isPluginOperationError(error)) {
      expect(error.code).toBe(code);
    }
  }
}

describe("prepareOperationSpaceInput", () => {
  it("rejects a conflicting explicit space_id on space_owned collection ops", () => {
    expect(() =>
      prepareOperationSpaceInput({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        input: { space_id: SPACE_B },
        policy: { kind: "space_owned" },
      })
    ).toThrow();
  });
});

describe("enforceOperationSpacePolicy", () => {
  it("fails closed when a space_owned record cannot be resolved", async () => {
    await expectCode(
      () =>
        enforceOperationSpacePolicy({
          auth: { spaceId: SPACE_A, tenantId: TENANT },
          findRecordSpaceId: async () => null,
          input: { id: "missing" },
          policy: {
            kind: "space_owned",
            record: { moduleId: "projects", idInputKey: "id" },
          },
        }),
      "space_record_unresolved"
    );
  });

  it("refuses a named account that is not mounted in the active Space", async () => {
    await expectCode(
      () =>
        enforceOperationSpacePolicy({
          auth: { spaceId: SPACE_A, tenantId: TENANT },
          input: { account: "conn-other" },
          isConnectionMounted: async (id) => id === "conn-here",
          policy: {
            kind: "account_mounted",
            connectionInputKey: "account",
          },
        }),
      "connection_not_in_space"
    );
  });
});

function principal(spaceId?: string): PrincipalContext {
  return {
    audience: ["engenty"],
    authMethod: "oauth",
    capabilities: ["*"],
    delegationChain: [],
    moduleIds: [],
    permissions: [],
    principalId: "user-1",
    principalType: "user",
    roleProfiles: [],
    roles: [],
    scopes: [],
    tenantId: TENANT,
    tokenType: "access",
    ...(spaceId ? { spaceId } : {}),
  };
}

describe("invokeOperation pre-dispatch", () => {
  it("injects space_id before the handler for space_owned list/create", async () => {
    let seen: unknown;
    const registry = makeEmptyRegistry({
      moduleOperations: [
        {
          pluginId: "core",
          operationId: "projects_list",
          methodName: "projects_list",
          handler: async (input) => {
            seen = input;
            return { data: [] };
          },
          operation: {
            moduleId: "projects",
            operationId: "projects_list",
            requiredCapabilities: ["module.projects.read"],
            riskLevel: "low",
            idempotent: true,
            dryRunSupported: true,
            requiresApproval: false,
            spacePolicy: { kind: "space_owned" },
          },
          source: "/modules/projects",
          pluginConfig: {},
        },
      ],
    });
    await invokeOperation({
      approvalService: createApprovalService(createFakeApprovalDb().client),
      auditLog: createNoopAuditLog(),
      auth: principal(SPACE_A),
      config: {},
      dataDir: "/tmp",
      input: { limit: 10 },
      operationId: "projects_list",
      registry,
      resolvePath: (p) => p,
    });
    expect(seen).toEqual({ limit: 10, space_id: SPACE_A });
  });

  it("refuses a cross-Space record id even when the user can enter both Spaces", async () => {
    const registry = makeEmptyRegistry({
      getTenantDb: () =>
        ({
          schema() {
            return {
              from() {
                return {
                  eq() {
                    return this;
                  },
                  maybeSingle: async () => ({
                    data: { space_id: SPACE_B },
                    error: null,
                  }),
                  select() {
                    return this;
                  },
                };
              },
            };
          },
        }) as never,
      moduleOperations: [
        {
          pluginId: "core",
          operationId: "projects_get",
          methodName: "projects_get",
          handler: async () => ({ id: PROJECT_B }),
          operation: {
            moduleId: "projects",
            operationId: "projects_get",
            requiredCapabilities: ["module.projects.read"],
            riskLevel: "low",
            idempotent: true,
            dryRunSupported: true,
            requiresApproval: false,
            spacePolicy: {
              kind: "space_owned",
              record: { moduleId: "projects", idInputKey: "id" },
            },
          },
          source: "/modules/projects",
          pluginConfig: {},
        },
      ],
    });
    try {
      await invokeOperation({
        approvalService: createApprovalService(createFakeApprovalDb().client),
        auditLog: createNoopAuditLog(),
        auth: principal(SPACE_A),
        config: {},
        dataDir: "/tmp",
        input: { id: PROJECT_B },
        operationId: "projects_get",
        registry,
        resolvePath: (p) => p,
      });
      throw new Error("expected mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(InvokeOperationError);
      expect((error as InvokeOperationError).status).toBe(404);
      expect((error as InvokeOperationError).body).toMatchObject({
        code: "space_record_mismatch",
      });
    }
  });
});
