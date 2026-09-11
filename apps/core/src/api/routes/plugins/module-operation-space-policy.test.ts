import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import { isPluginOperationError } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { makeEmptyRegistry } from "../../../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../../../security/audit-adapter.js";
import type { PrincipalContext } from "../../../security/auth.js";
import { buildOperationContracts } from "../../operation-contracts.js";
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
const PROJECT_A = "project-a";
const PROJECT_B = "project-b";

const spaces = new Map<string, string>([
  [PROJECT_A, SPACE_A],
  [PROJECT_B, SPACE_B],
]);

const findRecordSpaceId = async (input: { recordId: string }) =>
  spaces.get(input.recordId) ?? null;

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
  it("injects auth.spaceId into space_owned collection/create input", () => {
    expect(
      prepareOperationSpaceInput({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        input: { limit: 20 },
        policy: { kind: "space_owned" },
      })
    ).toEqual({ limit: 20, space_id: SPACE_A });
  });

  it("rejects a conflicting explicit space_id on space_owned collection ops", () => {
    expect(() =>
      prepareOperationSpaceInput({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        input: { space_id: SPACE_B },
        policy: { kind: "space_owned" },
      })
    ).toThrow();
  });

  it("does not invent space_id for tenant_shared, user_owned, or global runs", () => {
    expect(
      prepareOperationSpaceInput({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        input: { query: "acme" },
        policy: { kind: "tenant_shared" },
      })
    ).toEqual({ query: "acme" });
    expect(
      prepareOperationSpaceInput({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        input: {},
        policy: { kind: "user_owned" },
      })
    ).toEqual({});
    expect(
      prepareOperationSpaceInput({
        auth: { tenantId: TENANT },
        input: { limit: 20 },
        policy: { kind: "space_owned" },
      })
    ).toEqual({ limit: 20 });
  });
});

describe("enforceOperationSpacePolicy", () => {
  it("refuses a space_owned get/update/delete id from another Space", async () => {
    await expectCode(
      () =>
        enforceOperationSpacePolicy({
          auth: { spaceId: SPACE_A, tenantId: TENANT },
          findRecordSpaceId,
          input: { id: PROJECT_B },
          policy: {
            kind: "space_owned",
            record: { moduleId: "projects", idInputKey: "id" },
          },
        }),
      "space_record_mismatch"
    );
  });

  it("allows a matching space_owned record and stamps space_id", async () => {
    await expect(
      enforceOperationSpacePolicy({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        findRecordSpaceId,
        input: { id: PROJECT_A },
        policy: {
          kind: "space_owned",
          record: { moduleId: "projects", idInputKey: "id" },
        },
      })
    ).resolves.toEqual({ id: PROJECT_A, space_id: SPACE_A });
  });

  it("fails closed when a space_owned record cannot be resolved", async () => {
    await expectCode(
      () =>
        enforceOperationSpacePolicy({
          auth: { spaceId: SPACE_A, tenantId: TENANT },
          findRecordSpaceId,
          input: { id: "missing" },
          policy: {
            kind: "space_owned",
            record: { moduleId: "projects", idInputKey: "id" },
          },
        }),
      "space_record_unresolved"
    );
  });

  it("does not invent space_id for tenant_shared even when Space-bound", async () => {
    await expect(
      enforceOperationSpacePolicy({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        input: { display_name: "Ada" },
        policy: { kind: "tenant_shared" },
      })
    ).resolves.toEqual({ display_name: "Ada" });
  });

  it("reuses account_mounted connection intersection when a named account is unmounted", async () => {
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
    await expect(
      enforceOperationSpacePolicy({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        input: { account: "conn-here" },
        isConnectionMounted: async (id) => id === "conn-here",
        policy: {
          kind: "account_mounted",
          connectionInputKey: "account",
        },
      })
    ).resolves.toEqual({ account: "conn-here" });
  });

  it("leaves user_owned and missing policy input unchanged", async () => {
    await expect(
      enforceOperationSpacePolicy({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        input: { note: "mine" },
        policy: { kind: "user_owned" },
      })
    ).resolves.toEqual({ note: "mine" });
    await expect(
      enforceOperationSpacePolicy({
        auth: { spaceId: SPACE_A, tenantId: TENANT },
        input: { q: "x" },
        policy: undefined,
      })
    ).resolves.toEqual({ q: "x" });
  });
});

describe("catalog record_scope", () => {
  it("reports declared spacePolicy as record_scope without guessing", () => {
    const registry = makeEmptyRegistry({
      moduleOperations: [
        {
          pluginId: "core",
          operationId: "projects_list",
          methodName: "projects_list",
          handler: async () => ({ data: [] }),
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
        {
          pluginId: "contacts",
          operationId: "contacts_list",
          methodName: "contacts_list",
          handler: async () => ({ data: [] }),
          operation: {
            moduleId: "contacts",
            operationId: "contacts_list",
            requiredCapabilities: ["module.contacts.read"],
            riskLevel: "low",
            idempotent: true,
            dryRunSupported: true,
            requiresApproval: false,
            spacePolicy: { kind: "tenant_shared" },
          },
          source: "/modules/contacts",
          pluginConfig: {},
        },
      ],
    });
    const contracts = buildOperationContracts(registry);
    expect(
      contracts.find((c) => c.operationId === "projects_list")
    ).toMatchObject({
      record_scope: "space_owned",
      spacePolicy: { kind: "space_owned" },
    });
    expect(
      contracts.find((c) => c.operationId === "contacts_list")
    ).toMatchObject({
      record_scope: "tenant_shared",
      spacePolicy: { kind: "tenant_shared" },
    });
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
