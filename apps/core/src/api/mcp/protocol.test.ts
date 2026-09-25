import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { makeEmptyRegistry } from "../../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../../security/audit-adapter.js";
import { createStaticGrantsService } from "../../security/grants-service.js";
import { createApiApp } from "../server.js";
import { createMemoryMcpGrantStore } from "./grants.js";

const SECRET = "test-security-secret";

async function mcpToken(audience: string): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    client_id: "cursor",
    acting_for_user_id: "user-1",
    role: "agent",
    capabilities: ["module.read"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .setAudience(audience)
    .sign(new TextEncoder().encode(SECRET));
}

function appWithMcp() {
  return createApiApp({
    approvalService: createApprovalService(createFakeApprovalDb().client),
    auditLog: createNoopAuditLog(),
    config: { securityJwtSecret: SECRET },
    dataDir: "/tmp",
    grantsService: createStaticGrantsService({
      capabilities: ["*"],
      roleProfiles: ["agent.assistant"],
    }),
    mcpGrants: createMemoryMcpGrantStore([
      {
        clientId: "cursor",
        maxRiskLevel: "medium",
        spaceIds: ["space-1"],
        tenantId: "tenant-1",
        userId: "user-1",
      },
    ]),
    registry: makeEmptyRegistry(),
    resolvePath: (p: string) => p,
  });
}

describe("MCP protocol edge", () => {
  it("challenges unauthenticated /mcp callers and rejects generic aud", async () => {
    const app = appWithMcp();
    const missing = await app.request("/mcp", { method: "POST" });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate") ?? "").toMatch(/Bearer/);

    const generic = await mcpToken("engenty");
    const rejected = await app.request("/mcp", {
      headers: {
        authorization: `Bearer ${generic}`,
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
      },
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
      }),
    });
    expect(rejected.status).toBe(401);
  });

  it("accepts an MCP-audience token for a granted client", async () => {
    const app = appWithMcp();
    const token = await mcpToken("engenty-mcp");
    const res = await app.request("/mcp", {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "server/discover",
      },
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
      }),
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("rejects a browser Origin that is not on the allowlist", async () => {
    const app = appWithMcp();
    const token = await mcpToken("engenty-mcp");
    const res = await app.request("/mcp", {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
      }),
    });
    expect(res.status).toBe(403);
  });
});
