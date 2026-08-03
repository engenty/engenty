/**
 * IdentityAdminService adapter compliance tests. Verifies
 * createSupabaseIdentityAdminAdapter returns a compliant implementation.
 */
import { describe, expect, it, vi } from "vitest";
import type { IdentityAdminService } from "./identity-admin-service.js";
import { createSupabaseIdentityAdminAdapter } from "./supabase-identity-admin-adapter.js";

function createMockSupabaseClient() {
  return {
    auth: {
      admin: {
        createUser: vi.fn(),
        deleteUser: vi.fn(),
        updateUserById: vi.fn(),
        getUserById: vi.fn(),
      },
    },
  } as unknown;
}

describe("IdentityAdminService compliance (Supabase adapter)", () => {
  it("createSupabaseIdentityAdminAdapter returns IdentityAdminService-shaped object", () => {
    const mock = createMockSupabaseClient();
    const service: IdentityAdminService = createSupabaseIdentityAdminAdapter(
      mock as never
    );

    expect(service).toBeDefined();
    expect(typeof service.createUser).toBe("function");
    expect(typeof service.deleteUser).toBe("function");
    expect(typeof service.updateUser).toBe("function");
    expect(typeof service.updateUserPassword).toBe("function");
    expect(typeof service.getUserById).toBe("function");
    expect(typeof service.listUserIdentities).toBe("function");
  });
});
