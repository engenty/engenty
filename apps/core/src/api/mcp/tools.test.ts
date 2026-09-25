import { describe, expect, it } from "vitest";
import { makeEmptyRegistry } from "../../plugins/test-fixtures.js";
import type { PrincipalContext } from "../../security/auth.js";
import {
  buildOperationContracts,
  type OperationContract,
} from "../operation-contracts.js";
import { catalogExecuteAllowed, directToolAllowed } from "./tools.js";

function contract(
  overrides: Partial<OperationContract> &
    Pick<OperationContract, "operationId" | "moduleId">
): OperationContract {
  return {
    auth: {
      allowedPrincipalTypes: ["user", "agent", "service"],
      requiredCapabilities: ["module.read"],
      requiredPermissions: [],
      requiredScopes: [],
      riskLevel: "low",
      requiresApproval: false,
    },
    inputSchema: { type: "none" },
    methodName: overrides.operationId,
    mcp: {
      declared: true,
      disposition: "default",
      enabled: true,
      taskCapable: false,
    },
    outputSchema: { type: "none" },
    pluginId: overrides.moduleId,
    readOnly: true,
    toolId: overrides.operationId,
    transports: ["rest", "cli", "mcp"],
    ...overrides,
  };
}

const principal = {
  audience: [],
  authMethod: "oauth",
  capabilities: ["module.read"],
  clientId: "cursor",
  delegationChain: [],
  maxRiskLevel: "medium",
  moduleIds: ["contacts"],
  permissions: [],
  principalId: "mcp:cursor",
  principalType: "agent",
  roleProfiles: [],
  roles: [],
  scopes: [],
  tenantId: "t",
  tokenType: "access",
} as PrincipalContext;

describe("MCP hybrid tool projection", () => {
  const list = contract({ moduleId: "contacts", operationId: "contacts_list" });
  const update = contract({
    auth: {
      allowedPrincipalTypes: ["user", "agent", "service"],
      requiredCapabilities: ["module.write"],
      requiredPermissions: [],
      requiredScopes: [],
      requiresApproval: false,
      riskLevel: "medium",
    },
    moduleId: "contacts",
    operationId: "contacts_update",
    readOnly: false,
    mcp: {
      declared: true,
      disposition: "explicit_grant",
      enabled: true,
      taskCapable: false,
    },
  });
  const invoices = contract({
    moduleId: "invoices",
    operationId: "invoices_list",
  });
  // Built from a registered operation so the declared `never` disposition
  // flows through the real contract derivation.
  const never = buildOperationContracts(
    makeEmptyRegistry({
      moduleOperations: [
        {
          pluginId: "core",
          operationId: "core_impersonate_user",
          methodName: "core_impersonate_user",
          handler: async () => ({}),
          operation: {
            moduleId: "contacts",
            operationId: "core_impersonate_user",
            requiredCapabilities: ["module.read"],
            riskLevel: "low",
            idempotent: true,
            dryRunSupported: false,
            requiresApproval: false,
            mcpDisposition: "never",
          },
          source: "test",
          pluginConfig: {},
        },
      ],
    })
  )[0]!;

  it("catalog-executes default reads on granted modules only", () => {
    expect(catalogExecuteAllowed(list, principal)).toBe(true);
    expect(catalogExecuteAllowed(update, principal)).toBe(false);
    expect(catalogExecuteAllowed(invoices, principal)).toBe(false);
  });

  it("projects direct tools for granted modules including explicit_grant writes when write is on", () => {
    expect(directToolAllowed(update, principal)).toBe(false);
    expect(
      directToolAllowed(update, {
        ...principal,
        capabilities: ["module.read", "module.write"],
      })
    ).toBe(true);
    expect(directToolAllowed(never, principal)).toBe(false);
  });
});
