import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { authenticateMcpRequest, McpAuthError } from "./auth.js";
import { createMemoryMcpGrantStore } from "./grants.js";

const SECRET = "test-jwt-secret-for-mcp-auth-audience-checks";

async function mint(claims: Record<string, unknown>): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    client_id: "cursor",
    acting_for_user_id: "user-1",
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .setAudience(String(claims.aud ?? "engenty-mcp"))
    .sign(new TextEncoder().encode(SECRET));
}

describe("authenticateMcpRequest", () => {
  const grants = createMemoryMcpGrantStore([
    {
      clientId: "cursor",
      maxRiskLevel: "medium",
      spaceIds: ["space-1"],
      tenantId: "tenant-1",
      userId: "user-1",
    },
  ]);
  const config = { securityJwtSecret: SECRET };

  it("rejects a missing bearer and the generic engenty audience", async () => {
    await expect(
      authenticateMcpRequest({
        authorizationHeader: undefined,
        config,
        grants,
      })
    ).rejects.toBeInstanceOf(McpAuthError);

    const generic = await mint({ aud: "engenty" });
    await expect(
      authenticateMcpRequest({
        authorizationHeader: `Bearer ${generic}`,
        config,
        grants,
      })
    ).rejects.toMatchObject({ message: "invalid_audience" });
  });

  it("maps an MCP token to an autonomous agent acting for the user", async () => {
    const token = await mint({ aud: "engenty-mcp" });
    const { principal, grant } = await authenticateMcpRequest({
      authorizationHeader: `Bearer ${token}`,
      config,
      grants,
    });
    expect(principal.principalType).toBe("agent");
    expect(principal.principalId).toBe("mcp:cursor");
    expect(principal.actingForUserId).toBe("user-1");
    expect(principal.transport).toBe("mcp");
    expect(grant.maxRiskLevel).toBe("medium");
    expect(principal.capabilities).toEqual([]);
    expect(principal.spaceId).toBe("space-1");
  });
});
