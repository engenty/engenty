import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import type { ServerContext } from "@engenty/mcp-server";
import { describe, expect, it } from "vitest";
import { makeEmptyRegistry } from "../../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../../security/audit-adapter.js";
import type { PrincipalContext } from "../../security/auth.js";
import { buildOperationContracts } from "../operation-contracts.js";
import { resetMrtrNoncesForTests } from "./approvals-mrtr.js";
import { createStaticMcpAuthorityResolver } from "./authority.js";
import { invokeMcpOperation } from "./invoke-mcp.js";
import { createMemoryMcpTaskStore } from "./tasks.js";

const SECRET = "test-security-secret";
const grant = {
  clientId: "cursor",
  maxRiskLevel: "critical" as const,
  spaceIds: ["space-1"],
  tenantId: "tenant-1",
  userId: "user-1",
};

/** What `authenticateMcpRequest` mints for a granted client. */
const principal = {
  actingForUserId: "user-1",
  agentId: "mcp:cursor",
  audience: ["engenty-mcp"],
  authMethod: "oauth",
  capabilities: ["module.contacts.write"],
  clientId: "cursor",
  delegationChain: [],
  moduleIds: [],
  permissions: [],
  principalId: "mcp:cursor",
  principalType: "agent",
  roleProfiles: ["agent.assistant"],
  roles: ["agent"],
  scopes: [],
  tenantId: "tenant-1",
  tokenType: "access",
  transport: "mcp",
} as PrincipalContext;

function registryWithApprovalGate() {
  return makeEmptyRegistry({
    moduleOperations: [
      {
        pluginId: "core",
        operationId: "contacts_delete",
        methodName: "contacts_delete",
        handler: async () => ({ deleted: true }),
        operation: {
          moduleId: "contacts",
          operationId: "contacts_delete",
          requiredCapabilities: ["module.contacts.write"],
          riskLevel: "critical",
          idempotent: false,
          dryRunSupported: false,
          requiresApproval: true,
        },
        source: "/modules/contacts",
        pluginConfig: {},
      },
    ],
  });
}

describe("invokeMcpOperation approval round-trip", () => {
  it("persists allow-once and consumes it before one successful retry", async () => {
    resetMrtrNoncesForTests();
    const registry = registryWithApprovalGate();
    const contract = buildOperationContracts(registry).find(
      (item) => item.operationId === "contacts_delete"
    )!;
    const approvalService = createApprovalService(
      createFakeApprovalDb().client
    );
    const runtime = {
      approvalService,
      auditLog: createNoopAuditLog(),
      authority: createStaticMcpAuthorityResolver(),
      config: { securityJwtSecret: SECRET },
      dataDir: "/tmp",
      registry,
      resolvePath: (p: string) => p,
      tasks: createMemoryMcpTaskStore(),
    };
    const first = await invokeMcpOperation({
      arguments: { id: "c1" },
      contract,
      grant,
      operationId: "contacts_delete",
      principal,
      runtime,
    });
    const requestState = (first as { requestState?: string }).requestState!;
    const ctx = {
      mcpReq: {
        envelope: {},
        inputResponses: {
          approval: {
            action: "accept",
            content: { decision: "allow_once" },
          },
        },
        requestState: () => requestState,
      },
    } as unknown as ServerContext;

    const retried = await invokeMcpOperation({
      arguments: { id: "c1" },
      contract,
      ctx,
      grant,
      operationId: "contacts_delete",
      principal,
      runtime,
    });

    const contentBlock = Array.isArray(retried.content)
      ? retried.content[0]
      : undefined;
    expect(contentBlock).toMatchObject({
      type: "text",
      text: expect.stringContaining('"deleted": true'),
    });
  });
});
