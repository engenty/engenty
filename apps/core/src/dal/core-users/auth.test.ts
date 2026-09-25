import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthUnavailableError,
  AuthVerificationError,
  isAuthUserSuperAdmin,
  resolveAuthUser,
  type SupabaseAuthVerificationConfig,
} from "./auth.js";

const authConfig: SupabaseAuthVerificationConfig = {
  anonKey: "anon-key",
  url: "https://example.supabase.co",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveAuthUser", () => {
  // An outage must never read as a bad session: 401 sends the user to re-login.
  it.each([
    {
      name: "401 rejection",
      response: { ok: false, status: 401 },
      error: AuthVerificationError,
      status: 401,
    },
    {
      name: "403 rejection",
      response: { ok: false, status: 403 },
      error: AuthVerificationError,
      status: 401,
    },
    {
      name: "5xx from auth server",
      response: { ok: false, status: 500 },
      error: AuthUnavailableError,
      status: 503,
    },
    {
      name: "unreachable auth server",
      response: null,
      error: AuthUnavailableError,
      status: 503,
    },
  ])("maps $name to $status", async ({ response, error, status }) => {
    vi.stubGlobal(
      "fetch",
      response
        ? vi.fn().mockResolvedValue({
            ...response,
            json: async () => ({ msg: "nope" }),
            text: async () => JSON.stringify({ msg: "nope" }),
          })
        : vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"))
    );
    const rejection = resolveAuthUser({} as never, "some-token", authConfig);
    await expect(rejection).rejects.toBeInstanceOf(error);
    await expect(rejection).rejects.toMatchObject({ status });
  });
});

describe("isAuthUserSuperAdmin", () => {
  function clientWithMemberRow() {
    const row = {
      id: "user-1",
      tenant_id: "tenant-1",
      role: "admin",
      is_super_admin: false,
    };
    const terminal = {
      eq: () => terminal,
      maybeSingle: async () => ({ error: null, data: row }),
    };
    return {
      schema: () => ({ from: () => ({ select: () => terminal }) }),
    } as never;
  }

  function stubAuthUser(metadata: {
    app_metadata: Record<string, unknown>;
    user_metadata: Record<string, unknown>;
  }) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "user-1", ...metadata }),
        text: async () => "",
      })
    );
  }

  // app_metadata is server-controlled; user_metadata is writable by the user.
  it("grants superadmin from app_metadata", async () => {
    stubAuthUser({ app_metadata: { is_super_admin: true }, user_metadata: {} });
    await expect(
      isAuthUserSuperAdmin(clientWithMemberRow(), "token-app-meta", authConfig)
    ).resolves.toBe(true);
  });

  it("never grants superadmin from user_metadata", async () => {
    stubAuthUser({ app_metadata: {}, user_metadata: { is_super_admin: true } });
    await expect(
      isAuthUserSuperAdmin(clientWithMemberRow(), "token-user-meta", authConfig)
    ).resolves.toBe(false);
  });
});
