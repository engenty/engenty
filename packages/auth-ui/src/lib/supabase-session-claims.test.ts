import { describe, expect, it } from "vitest";
import {
  claimsMatchWorkspaceTenant,
  readSupabaseAccessTokenClaims,
} from "./supabase-session-claims";

function encodePayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const base64 = btoa(json);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sampleToken(payload: Record<string, unknown>): string {
  return `header.${encodePayload(payload)}.signature`;
}

describe("readSupabaseAccessTokenClaims", () => {
  it("reads tenant_id and scopes from access token payload", () => {
    const claims = readSupabaseAccessTokenClaims(
      sampleToken({
        tenant_id: "tenant-1",
        scopes: ["default", 1, ""],
      })
    );
    expect(claims).toEqual({
      tenant_id: "tenant-1",
      scopes: ["default"],
    });
  });

  it("returns empty claims for malformed tokens", () => {
    expect(readSupabaseAccessTokenClaims("not-a-jwt")).toEqual({ scopes: [] });
  });
});

describe("claimsMatchWorkspaceTenant", () => {
  it("matches when tenant ids align", () => {
    expect(
      claimsMatchWorkspaceTenant(
        { tenant_id: "tenant-1", scopes: ["default"] },
        "tenant-1"
      )
    ).toBe(true);
  });

  it("rejects missing or mismatched tenant ids", () => {
    expect(
      claimsMatchWorkspaceTenant({ scopes: ["default"] }, "tenant-1")
    ).toBe(false);
    expect(
      claimsMatchWorkspaceTenant(
        { tenant_id: "tenant-2", scopes: ["default"] },
        "tenant-1"
      )
    ).toBe(false);
  });
});
