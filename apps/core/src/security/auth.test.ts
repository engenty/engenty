// A token whose role claim is missing or unreadable must fail low, never
// resolve to the capable service principal.

import { SignJWT } from "jose";
import { uuidv7 } from "uuidv7";
import { describe, expect, it } from "vitest";
import { verifyAccessToken } from "./auth.js";

const SECRET = "test-jwt-secret-for-auth-principal-defaults";

async function tokenWithClaims(
  claims: Record<string, unknown>
): Promise<string> {
  return await new SignJWT({ tenant_id: "tenant-1", ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("principal-1")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setJti(uuidv7())
    .setExpirationTime("3600s")
    .sign(new TextEncoder().encode(SECRET));
}

describe("verifyAccessToken — principal type defaults", () => {
  it("does not make a role-less token a capable service principal", async () => {
    const principal = await verifyAccessToken(
      `Bearer ${await tokenWithClaims({})}`,
      SECRET
    );
    expect(principal).not.toBeNull();
    expect(principal?.principalType).not.toBe("service");
    expect(principal?.capabilities).toEqual(["module.read"]);
  });
});
