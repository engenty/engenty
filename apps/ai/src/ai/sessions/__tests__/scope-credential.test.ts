import { describe, expect, it } from "vitest";
import {
  type AiSessionScope,
  resolveScopeCredential,
  scopeAccessToken,
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

  it("treats a bare legacy userAccessToken as a user credential", () => {
    // That is what the field always meant; headless callers set `credential`
    // explicitly, so nothing silently becomes a service principal.
    const scope: AiSessionScope = { ...base, userAccessToken: "session-token" };
    expect(resolveScopeCredential(scope)).toEqual({
      kind: "user",
      token: "session-token",
    });
  });

  it("prefers the credential field over the legacy shim", () => {
    const scope: AiSessionScope = {
      ...base,
      credential: { kind: "service", token: "svc-token" },
      userAccessToken: "stale-token",
    };
    expect(scopeAccessToken(scope)).toBe("svc-token");
    expect(resolveScopeCredential(scope)?.kind).toBe("service");
  });

  it("ignores blank tokens on either field", () => {
    expect(
      scopeAccessToken({ ...base, userAccessToken: "   " })
    ).toBeUndefined();
    expect(
      scopeAccessToken({ ...base, credential: { kind: "user", token: "  " } })
    ).toBeUndefined();
  });

  it("falls back to the shim when the credential field holds a blank token", () => {
    const scope: AiSessionScope = {
      ...base,
      credential: { kind: "service", token: "" },
      userAccessToken: "session-token",
    };
    expect(scopeAccessToken(scope)).toBe("session-token");
  });
});
