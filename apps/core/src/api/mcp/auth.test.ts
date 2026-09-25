import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { authenticateMcpRequest } from "./auth.js";
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
    .setAudience("engenty-mcp")
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

  it("ignores capability claims and authenticates the client as an agent", async () => {
    const token = await mint({ capabilities: ["*"] });
    const { principal } = await authenticateMcpRequest({
      authorizationHeader: `Bearer ${token}`,
      config,
      grants,
    });
    expect(principal.principalType).toBe("agent");
    expect(principal.capabilities).toEqual([]);
  });

  it("refuses a valid token whose client has no grant", async () => {
    const token = await mint({ client_id: "ungranted" });
    await expect(
      authenticateMcpRequest({
        authorizationHeader: `Bearer ${token}`,
        config,
        grants,
      })
    ).rejects.toMatchObject({ status: 403, message: "no_grant" });
  });
});
