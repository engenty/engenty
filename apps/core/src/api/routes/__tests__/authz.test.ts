import { describe, expect, it, vi } from "vitest";
import {
  readBearerToken,
  requireAuth,
  requireSuperAdmin,
  resolveRouteAuth,
} from "../authz.js";

const mockDal = vi.hoisted(() => ({
  resolveAuthUser: vi.fn(),
  getTenantIdForAuthUser: vi.fn(),
  isAuthUserSuperAdmin: vi.fn(),
}));

vi.mock("../../../dal/core-users.js", () => ({
  createCoreUsersDal: () => mockDal,
}));

vi.mock("../../../security/auth.js", () => ({
  getSecuritySecret: () => "test-secret",
  verifyAccessToken: vi.fn(),
}));

import { verifyAccessToken } from "../../../security/auth.js";

describe("readBearerToken", () => {
  it("returns null when authHeader is undefined", () => {
    expect(readBearerToken(undefined)).toBeNull();
  });

  it("returns null when authHeader is empty", () => {
    expect(readBearerToken("")).toBeNull();
  });

  it("returns null when authHeader does not start with bearer", () => {
    expect(readBearerToken("Basic abc123")).toBeNull();
  });

  it("returns null when authHeader uses wrong case for bearer without Bearer prefix", () => {
    expect(readBearerToken("BEARER token")).not.toBeNull();
  });

  it("extracts token from Bearer header", () => {
    expect(readBearerToken("Bearer my-token-123")).toBe("my-token-123");
  });

  it("extracts token from bearer header (lowercase)", () => {
    expect(readBearerToken("bearer session-xyz")).toBe("session-xyz");
  });

  it("trims whitespace around token", () => {
    expect(readBearerToken("Bearer  token-with-spaces  ")).toBe(
      "token-with-spaces"
    );
  });
});

describe("resolveRouteAuth", () => {
  it("returns auth from JWT when verifyAccessToken succeeds", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      principalId: "user-1",
      tenantId: "tenant-1",
      principalType: "user",
      capabilities: ["module.read"],
      isSuperAdmin: false,
    } as never);

    const c = {
      req: {
        header: (name: string) =>
          name === "authorization" ? "Bearer jwt-token" : undefined,
      },
      json: (body: unknown, status?: number) =>
        new Response(JSON.stringify(body), { status: status ?? 200 }),
    };

    const result = await resolveRouteAuth(c as never, {});
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user-1");
    expect(result?.tenantId).toBe("tenant-1");
    expect(result?.isSuperAdmin).toBe(false);
    expect(result?.capabilities).toEqual(["module.read"]);
  });

  it("returns isSuperAdmin true when JWT has core.superadmin capability", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      principalId: "admin",
      tenantId: "tenant-1",
      principalType: "user",
      capabilities: ["core.superadmin"],
      isSuperAdmin: true,
    } as never);

    const c = {
      req: { header: () => "Bearer jwt-token" },
      json: () => new Response(),
    };

    const result = await resolveRouteAuth(c as never, {});
    expect(result?.isSuperAdmin).toBe(true);
  });

  it("returns null when no authorization header", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue(null);

    const c = {
      req: { header: () => undefined },
      json: () => new Response(),
    };

    const result = await resolveRouteAuth(c as never, {});
    expect(result).toBeNull();
  });

  it("returns null when session token path throws", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue(null);
    mockDal.resolveAuthUser.mockResolvedValue({
      id: "u1",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as never);
    mockDal.getTenantIdForAuthUser.mockRejectedValue(new Error("invalid"));
    mockDal.isAuthUserSuperAdmin.mockResolvedValue(false);

    const c = {
      req: { header: () => "Bearer session-token" },
      json: () => new Response(),
    };

    const result = await resolveRouteAuth(c as never, {});
    expect(result).toBeNull();
  });
});

describe("requireAuth", () => {
  it("returns error response when auth resolves to null", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue(null);
    mockDal.resolveAuthUser.mockRejectedValue(new Error("invalid"));

    const jsonFn = vi.fn(() => new Response());
    const c = {
      req: { header: () => "Bearer bad-token" },
      json: jsonFn,
    };

    const result = await requireAuth(c as never, {});
    expect("error" in result).toBe(true);
    expect(jsonFn).toHaveBeenCalledWith(
      {
        ok: false,
        error: {
          code: "unauthorized",
          message: "Unauthorized",
        },
      },
      401
    );
  });

  it("returns auth when resolve succeeds", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      principalId: "u1",
      tenantId: "t1",
      principalType: "user",
      capabilities: [],
      isSuperAdmin: false,
    } as never);

    const c = {
      req: { header: () => "Bearer jwt" },
      json: () => new Response(),
    };

    const result = await requireAuth(c as never, {});
    expect("auth" in result).toBe(true);
    expect((result as { auth: unknown }).auth).toMatchObject({
      userId: "u1",
      tenantId: "t1",
    });
  });
});

describe("requireSuperAdmin", () => {
  it("returns 403 when auth is not superadmin", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      principalId: "u1",
      tenantId: "t1",
      principalType: "user",
      capabilities: [],
      isSuperAdmin: false,
    } as never);

    const jsonFn = vi.fn(() => new Response());
    const c = {
      req: { header: () => "Bearer jwt" },
      json: jsonFn,
    };

    const result = await requireSuperAdmin(c as never, {});
    expect("error" in result).toBe(true);
    expect(jsonFn).toHaveBeenCalledWith(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "Forbidden",
        },
      },
      403
    );
  });

  it("returns auth when user is superadmin", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      principalId: "admin",
      tenantId: "t1",
      principalType: "user",
      capabilities: ["core.superadmin"],
      isSuperAdmin: true,
    } as never);

    const c = {
      req: { header: () => "Bearer jwt" },
      json: () => new Response(),
    };

    const result = await requireSuperAdmin(c as never, {});
    expect("auth" in result).toBe(true);
  });
});
