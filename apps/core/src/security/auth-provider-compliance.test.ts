/**
 * AuthProvider adapter compliance tests. Verifies createSupabaseAuthProvider
 * returns an AuthProvider-compliant object.
 */
import { describe, expect, it } from "vitest";
import {
  type AuthProvider,
  createSupabaseAuthProvider,
} from "./auth-provider.js";

describe("AuthProvider compliance (Supabase adapter)", () => {
  it("createSupabaseAuthProvider returns AuthProvider-shaped object", () => {
    const config = { SECURITY_SECRET: "test-secret-32-chars-long!!!!" };
    const provider = createSupabaseAuthProvider(config);

    expect(provider).toBeDefined();
    expect(typeof provider.verifyToken).toBe("function");
    expect(typeof provider.resolveAdminFallback).toBe("function");
    expect(typeof provider.resolvePrincipal).toBe("function");
    expect(typeof provider.resolveTenantForSession).toBe("function");
  });

  it("verifyToken returns null for invalid token", async () => {
    const config = { SECURITY_SECRET: "test-secret-32-chars-long!!!!" };
    const provider: AuthProvider = createSupabaseAuthProvider(config);
    const result = await provider.verifyToken("Bearer invalid");
    expect(result).toBeNull();
  });

  it("resolvePrincipal tries verifyToken then fallback", async () => {
    const config = { SECURITY_SECRET: "test-secret-32-chars-long!!!!" };
    const provider: AuthProvider = createSupabaseAuthProvider(config);
    const result = await provider.resolvePrincipal(undefined);
    expect(result).toBeNull();
  });
});
