import { describe, expect, it } from "vitest";
import {
  type AiSessionScope,
  resolveScopeCredential,
  scopeAccessToken,
  scopeAttributionUserId,
} from "../types.js";

const base: AiSessionScope = { tenantId: "tenant-1", userId: "user-1" };

describe("resolveScopeCredential", () => {
  it("returns null when the scope carries no credential", () => {
    expect(resolveScopeCredential(base)).toBeNull();
    expect(scopeAccessToken(base)).toBeUndefined();
  });

  it("reads the credential field when present", () => {
    const scope: AiSessionScope = {
      ...base,
      credential: { kind: "service", token: "svc-token" },
    };
    expect(resolveScopeCredential(scope)).toEqual({
      kind: "service",
      token: "svc-token",
    });
    expect(scopeAccessToken(scope)).toBe("svc-token");
  });

  it("ignores a blank token", () => {
    expect(
      scopeAccessToken({ ...base, credential: { kind: "user", token: "  " } })
    ).toBeUndefined();
  });
});

describe("scopeAttributionUserId", () => {
  it("returns the user id for a user credential and null for a service one", () => {
    expect(
      scopeAttributionUserId({
        ...base,
        credential: { kind: "user", token: "session-token" },
      })
    ).toBe("user-1");
    expect(
      scopeAttributionUserId({
        ...base,
        credential: { kind: "service", token: "svc-token" },
      })
    ).toBeNull();
  });
});
