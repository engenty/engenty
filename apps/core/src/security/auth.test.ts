// AUTH-04 regression: what a token that names no role gets to be.
//
// `parsePrincipalType` fell back to "service" for anything it did not
// recognise, and `defaultCapabilities("service")` hands out
// module.read/write/execute — so a token with no `role` claim and no
// `capabilities` claim arrived as a fully capable service principal. The
// unreadable case is the one that must fail low.

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
    // …and specifically not the service capability bundle.
    expect(principal?.capabilities).not.toContain("module.write");
    expect(principal?.capabilities).not.toContain("module.execute");
    expect(principal?.capabilities).toEqual(["module.read"]);
  });

  it("does not let an unrecognised role claim buy service capabilities", async () => {
    const principal = await verifyAccessToken(
      `Bearer ${await tokenWithClaims({ role: "superuser" })}`,
      SECRET
    );
    expect(principal?.principalType).not.toBe("service");
    expect(principal?.capabilities).toEqual(["module.read"]);
  });

  it("still honours a role a token names explicitly", async () => {
    for (const role of ["user", "agent", "service"] as const) {
      const principal = await verifyAccessToken(
        `Bearer ${await tokenWithClaims({ role })}`,
        SECRET
      );
      expect(principal?.principalType).toBe(role);
    }
  });

  it("never lets the default override an explicit capability claim", async () => {
    const principal = await verifyAccessToken(
      `Bearer ${await tokenWithClaims({
        capabilities: ["module.contacts.read"],
      })}`,
      SECRET
    );
    expect(principal?.capabilities).toEqual(["module.contacts.read"]);
  });
});
