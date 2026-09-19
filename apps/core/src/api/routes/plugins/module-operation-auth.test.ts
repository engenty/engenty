import { describe, expect, it } from "vitest";
import type { PrincipalContext } from "../../../security/auth.js";
import { withRequestPrincipalHeaders } from "./module-operation-auth.js";

function principal(patch: Partial<PrincipalContext> = {}): PrincipalContext {
  return {
    audience: [],
    authMethod: "unknown",
    capabilities: [],
    delegationChain: [],
    moduleIds: [],
    permissions: [],
    principalId: "user-1",
    principalType: "user",
    roleProfiles: [],
    roles: [],
    scopes: [],
    tenantId: "tenant-1",
    tokenType: "access",
    ...patch,
  };
}

describe("withRequestPrincipalHeaders", () => {
  it("stamps x-engenty-space-id onto the principal", () => {
    const headers: Record<string, string> = {
      "x-engenty-space-id": " space-1 ",
    };
    const auth = withRequestPrincipalHeaders(
      principal(),
      (name) => headers[name]
    );
    expect(auth.spaceId).toBe("space-1");
  });

  it("leaves spaceId unset when the header is absent", () => {
    const auth = withRequestPrincipalHeaders(principal(), () => undefined);
    expect(auth.spaceId).toBeUndefined();
  });
});
