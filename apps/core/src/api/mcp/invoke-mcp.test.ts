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
import {
  parseMrtrRequestState,
  resetMrtrNoncesForTests,
} from "./approvals-mrtr.js";
import { createStaticMcpAuthorityResolver } from "./authority.js";
import { invokeMcpOperation, textResult } from "./invoke-mcp.js";
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
  /**
   * The pipeline names the filed request `approvalRequestId`. Reading an
   * untyped `requestId` off the thrown body bound every retry to an empty id,
   * so the client was never told which approval to grant.
   */
  it("carries the filed approval id into the signed request state", async () => {
    resetMrtrNoncesForTests();
    const registry = registryWithApprovalGate();
    const contract = buildOperationContracts(registry).find(
      (item) => item.operationId === "contacts_delete"
    );
    const result = await invokeMcpOperation({
      arguments: { id: "c1" },
      contract: contract!,
      grant,
      operationId: "contacts_delete",
      principal,
      runtime: {
        approvalService: createApprovalService(createFakeApprovalDb().client),
        auditLog: createNoopAuditLog(),
        authority: createStaticMcpAuthorityResolver(),
        config: { securityJwtSecret: SECRET },
        dataDir: "/tmp",
        registry,
        resolvePath: (p) => p,
        tasks: createMemoryMcpTaskStore(),
      },
    });

    expect(result).toMatchObject({ resultType: "input_required" });
    const payload = parseMrtrRequestState(
      (result as { requestState?: string }).requestState ?? "",
      SECRET
    );
    expect(payload?.approvalRequestId).toBeTruthy();
    expect(payload?.operationId).toBe("contacts_delete");
    expect(payload?.clientId).toBe("cursor");
  });

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
    expect(retried).not.toHaveProperty("structuredContent");
  });
});

describe("textResult", () => {
  it("embeds JSON in content text and omits structuredContent without a widget", () => {
    const result = textResult("Completed contacts_list.", {
      data: [{ display_name: "Free2move Österreich GmbH" }],
      total: 1,
    });
    expect(result.content).toEqual([
      {
        type: "text",
        text: expect.stringContaining('"total": 1'),
      },
    ]);
    expect(result.content[0]).toMatchObject({ type: "text" });
    if (result.content[0]?.type === "text") {
      expect(
        result.content[0].text.startsWith("Completed contacts_list.\n")
      ).toBe(true);
      expect(result.content[0].text).not.toContain("[object Object]");
    }
    expect(result.structuredContent).toBeUndefined();
  });

  it("attaches structuredContent only when a widget resourceUri is present", () => {
    const result = textResult(
      "Completed contacts_list.",
      { total: 1 },
      "ui://engenty/operation-result.html"
    );
    expect(result.structuredContent).toEqual({ total: 1 });
    expect(result._meta).toEqual({
      ui: { resourceUri: "ui://engenty/operation-result.html" },
    });
  });

  it("wraps array payloads for widget structuredContent", () => {
    const result = textResult(
      "Granted Spaces.",
      [{ id: "space-1", name: "engrd" }],
      "ui://engenty/spaces.html"
    );
    expect(result.structuredContent).toEqual({
      result: [{ id: "space-1", name: "engrd" }],
    });
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("engrd");
    }
  });
});
